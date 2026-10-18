package com.wangwenlin.stock.service;

import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.common.Ids;
import com.wangwenlin.stock.common.JsStrings;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.mapper.LifeChatMessageMapper;
import com.wangwenlin.stock.mapper.LifeDailyTaskMapper;
import com.wangwenlin.stock.mapper.LifePlanNodeMapper;
import com.wangwenlin.stock.mapper.LifePlanRejectMapper;
import com.wangwenlin.stock.mapper.LifePurgeMapper;
import com.wangwenlin.stock.support.LifeSupport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 人生规划器「规划图与重置」子集 —— 逐行对齐 server.js 8881-9095 的 8 条路由。
 */
@Service
public class LifeGraphService {

    private static final Logger log = LoggerFactory.getLogger(LifeGraphService.class);

    /** 节点可写状态（与 server.js 8907 / 8935 / 8968 的数组一致，注意不含 delay）。 */
    private static final Set<String> NODE_STATUS = Set.of("todo", "doing", "done", "drop");

    /** 等价 server.js 9074 的 LIFE_WIPE_TABLES（顺序与标点保持一致）。 */
    private static final List<String> LIFE_WIPE_TABLES = List.of(
            "life_retrieval_logs", "life_retrieval_cache", "life_retrieval_queue", "life_retrieval_batches",
            "life_plan_snapshots", "life_change_logs", "life_plan_rejects", "life_persona_derived", "life_future_paths",
            "life_persona", "life_skill_profile", "life_knowledge", "life_calendar_events", "life_energy_logs",
            "life_daily_tasks", "life_chat_messages", "life_plan_nodes");

    private final LifePlanNodeMapper nodeMapper;
    private final LifePlanRejectMapper rejectMapper;
    private final LifeChatMessageMapper chatMapper;
    private final LifePurgeMapper purgeMapper;
    private final LifeDailyTaskMapper taskMapper;
    private final LifeQueryService queryService;
    private final LifeSupport support;

    public LifeGraphService(LifePlanNodeMapper nodeMapper,
                            LifePlanRejectMapper rejectMapper,
                            LifeChatMessageMapper chatMapper,
                            LifePurgeMapper purgeMapper,
                            LifeDailyTaskMapper taskMapper,
                            LifeQueryService queryService,
                            LifeSupport support) {
        this.nodeMapper = nodeMapper;
        this.rejectMapper = rejectMapper;
        this.chatMapper = chatMapper;
        this.purgeMapper = purgeMapper;
        this.taskMapper = taskMapper;
        this.queryService = queryService;
        this.support = support;
    }

    // ==================== POST /api/life/plan/nodes（server.js 8883） ====================

    public Map<String, Object> addNode(Map<String, Object> body) {
        Map<String, Object> payload = body == null ? new LinkedHashMap<>() : body;
        try {
            String title = support.lifeText(payload.get("title"), 200);
            if (title.isEmpty()) {
                throw ApiException.badRequest("节点标题不能为空");
            }
            // 手动新增＝用户明确要它：先从「不要了」清单移除（失败可忽略）
            try {
                rejectMapper.deleteByTitle(title);
            } catch (Exception ignored) {
                // 与 Node 的 .catch(() => '') 保持一致
            }

            String id = Ids.uuid();
            long now = System.currentTimeMillis();
            String givenType = JsStrings.trim(JsValues.toJsString(
                    firstTruthy(payload.get("contentType"), payload.get("content_type"), ""))).toLowerCase();
            Object contentRaw = firstTruthy(payload.get("contentBody"), payload.get("content_body"));
            String contentBody = JsValues.truthy(contentRaw)
                    ? (contentRaw instanceof String ? (String) contentRaw : support.jsonStringify(contentRaw, null))
                    : "";
            String kind = LifeSupport.LIFE_KINDS.contains(payload.get("kind"))
                    ? JsValues.toJsString(payload.get("kind")) : "goal";

            String parentId = support.lifeText(payload.get("parentId"), 64);
            if (!"self".equals(kind) && parentId.isEmpty()) {
                Map<String, Object> self = nodeMapper.selectFirstSelf();
                if (self != null) {
                    parentId = LifeSupport.str(self.get("id"));
                }
            }

            Map<String, Object> data = new LinkedHashMap<>();
            data.put("id", id);
            data.put("parent_id", "self".equals(kind) ? "" : parentId);
            data.put("kind", kind);
            data.put("domain", LifeSupport.LIFE_DOMAINS.contains(payload.get("domain"))
                    ? JsValues.toJsString(payload.get("domain")) : "成长");
            data.put("title", title);
            data.put("detail", support.lifeText(payload.get("detail"), 1200));
            data.put("risk", support.lifeText(payload.get("risk"), 200));
            data.put("status", NODE_STATUS.contains(payload.get("status"))
                    ? JsValues.toJsString(payload.get("status")) : "todo");
            data.put("horizon", support.lifeText(payload.get("horizon"), 32));
            data.put("start_date", support.lifeText(payload.get("startDate"), 10));
            data.put("weight", support.lifeClampWeight(payload.get("weight")));
            data.put("content_type", LifeSupport.LIFE_CONTENT_TYPES.contains(givenType) ? givenType : "");
            data.put("content_body", contentBody);
            data.put("progress_note", support.lifeText(payload.get("progressNote"), 1200));
            data.put("reference_ids", referenceIdsJson(payload.get("referenceIds")));
            data.put("is_shared", JsValues.truthy(payload.get("shared")) ? 1 : 0);
            data.put("source", "user");
            Double sortRaw = JsValues.parse(payload.get("sortOrder"));
            data.put("sort_order", sortRaw == null ? 0d : sortRaw);
            data.put("created_at", now);
            data.put("updated_at", now);
            nodeMapper.insertNodeManual(data);

            return nodesOut();
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw new ApiException(500, messageOr(error, "新增失败"));
        }
    }

    // ==================== PUT /api/life/plan/nodes/:id（server.js 8924） ====================

    public Map<String, Object> updateNode(String idRaw, Map<String, Object> body) {
        String id = idRaw == null ? "" : idRaw;
        Map<String, Object> payload = body == null ? new LinkedHashMap<>() : body;
        try {
            Map<String, Object> data = new LinkedHashMap<>();
            if (payload.containsKey("title")) {
                data.put("title", support.lifeText(payload.get("title"), 200));
            }
            if (payload.containsKey("detail")) {
                data.put("detail", support.lifeText(payload.get("detail"), 1200));
            }
            if (payload.containsKey("risk")) {
                data.put("risk", support.lifeText(payload.get("risk"), 200));
            }
            if (payload.containsKey("horizon")) {
                data.put("horizon", support.lifeText(payload.get("horizon"), 32));
            }
            if (payload.containsKey("startDate")) {
                data.put("start_date", support.lifeText(payload.get("startDate"), 10));
            }
            if (payload.containsKey("weight")) {
                data.put("weight", support.lifeClampWeight(payload.get("weight")));
            }
            if (payload.containsKey("status") && NODE_STATUS.contains(payload.get("status"))) {
                data.put("status", JsValues.toJsString(payload.get("status")));
            }
            if (payload.containsKey("domain") && LifeSupport.LIFE_DOMAINS.contains(payload.get("domain"))) {
                data.put("domain", JsValues.toJsString(payload.get("domain")));
            }
            if (payload.containsKey("kind") && LifeSupport.LIFE_KINDS.contains(payload.get("kind"))) {
                //「大脑」中心节点（kind=self）必须常驻：不允许把它改成别的类型
                Map<String, Object> row = nodeMapper.selectById(id);
                boolean isSelf = row != null && "self".equals(LifeSupport.orEmpty(row.get("kind")));
                if (!isSelf || "self".equals(JsValues.toJsString(payload.get("kind")))) {
                    data.put("kind", JsValues.toJsString(payload.get("kind")));
                }
            }
            if (payload.containsKey("parentId")) {
                data.put("parent_id", support.lifeText(payload.get("parentId"), 64));
            }
            if (payload.containsKey("series")) {
                data.put("series", support.lifeText(payload.get("series"), 64));
            }
            if (payload.containsKey("priority")) {
                data.put("priority", LifeSupport.LIFE_TASK_PRIORITY.contains(payload.get("priority"))
                        ? JsValues.toJsString(payload.get("priority")) : "");
            }
            if (payload.containsKey("stepNo")) {
                double raw = JsValues.parseOrZero(payload.get("stepNo"));
                long stepNo = Math.max(0, Math.min(999, (long) Math.round(raw)));
                data.put("step_no", stepNo);
            }
            if (payload.containsKey("timeGroup") && LifeSupport.LIFE_TIME_GROUPS.contains(payload.get("timeGroup"))) {
                data.put("time_group", JsValues.toJsString(payload.get("timeGroup")));
            }
            if (payload.containsKey("contentType")) {
                String type = JsStrings.trim(JsValues.toJsString(firstTruthy(payload.get("contentType"), "")))
                        .toLowerCase();
                data.put("content_type", LifeSupport.LIFE_CONTENT_TYPES.contains(type) ? type : "");
            }
            if (payload.containsKey("contentBody")) {
                Object raw = payload.get("contentBody");
                String contentBody = JsValues.truthy(raw)
                        ? (raw instanceof String ? (String) raw : support.jsonStringify(raw, null))
                        : "";
                data.put("content_body", contentBody);
            }
            if (payload.containsKey("progressNote")) {
                data.put("progress_note", support.lifeText(payload.get("progressNote"), 1200));
            }
            if (payload.containsKey("referenceIds")) {
                data.put("reference_ids", referenceIdsJson(payload.get("referenceIds")));
            }
            if (payload.containsKey("shared")) {
                data.put("is_shared", JsValues.truthy(payload.get("shared")) ? 1 : 0);
            }

            if (data.isEmpty()) {
                return nodesOut();
            }
            data.put("updated_at", System.currentTimeMillis());
            data.put("id", id);
            nodeMapper.updateNodeFields(data);

            // 任务类节点状态与「每日任务」双向同步
            if (payload.containsKey("status") && NODE_STATUS.contains(payload.get("status"))) {
                taskMapper.updateStatusByNodeId(JsValues.toJsString(payload.get("status")),
                        System.currentTimeMillis(), id);
            }

            return nodesOut();
        } catch (Exception error) {
            throw new ApiException(500, messageOr(error, "更新失败"));
        }
    }

    // ==================== DELETE /api/life/plan/nodes/:id（server.js 8982） ====================

    public Map<String, Object> deleteNode(String idRaw) {
        String id = idRaw == null ? "" : idRaw;
        try {
            Map<String, Object> self = nodeMapper.selectById(id);
            if (self != null && "self".equals(LifeSupport.orEmpty(self.get("kind")))) {
                throw ApiException.badRequest("「大脑」根节点不能删除，它是整张规划网络的起点");
            }
            List<Map<String, Object>> all = queryService.listLifeNodes();
            Map<String, List<Map<String, Object>>> kids = new LinkedHashMap<>();
            for (Map<String, Object> node : all) {
                String pid = LifeSupport.str(node.get("parentId"));
                kids.computeIfAbsent(pid, key -> new ArrayList<>()).add(node);
            }
            List<Map<String, Object>> doomed = new ArrayList<>();
            Deque<Map<String, Object>> queue = new ArrayDeque<>();
            for (Map<String, Object> node : all) {
                if (id.equals(LifeSupport.str(node.get("id")))) {
                    queue.add(node);
                }
            }
            while (!queue.isEmpty()) {
                Map<String, Object> node = queue.poll();
                doomed.add(node);
                for (Map<String, Object> kid : kids.getOrDefault(LifeSupport.str(node.get("id")), List.of())) {
                    queue.add(kid);
                }
            }
            long now = System.currentTimeMillis();
            for (Map<String, Object> node : doomed) {
                String title = LifeSupport.str(node.get("title")).trim();
                if (title.isEmpty()) {
                    continue;
                }
                try {
                    rejectMapper.upsertReject(LifeSupport.slice(title, 200),
                            LifeSupport.slice(LifeSupport.str(node.get("kind")), 32), now);
                } catch (Exception ignored) {
                    // 与 Node 的 .catch(() => '') 保持一致：单条写入失败不影响整体删除
                }
            }
            nodeMapper.deleteById(id);
            nodeMapper.updateParentId("", id);

            List<String> rejected = new ArrayList<>();
            for (Map<String, Object> node : doomed) {
                String title = LifeSupport.str(node.get("title"));
                if (JsValues.truthy(title)) {
                    rejected.add(title);
                }
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("nodes", queryService.listLifeNodes());
            out.put("rejected", rejected);
            return out;
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw new ApiException(500, messageOr(error, "删除失败"));
        }
    }

    // ==================== DELETE /api/life/plan（server.js 9021） ====================

    public Map<String, Object> resetPlan() {
        try {
            // 保留「大脑」中心节点（kind=self）
            try {
                nodeMapper.deleteNonSelf();
            } catch (Exception ignored) {
                // 与 Node 的 .catch(() => '') 保持一致
            }
            List<String> tables = List.of(
                    "life_daily_tasks",
                    "life_plan_snapshots",
                    "life_energy_logs",
                    "life_calendar_events",
                    "life_change_logs",
                    "life_plan_rejects");
            for (String table : tables) {
                try {
                    purgeMapper.deleteAllFromTable(table);
                } catch (Exception ignored) {
                    // 与 Node 的 .catch(() => '') 保持一致
                }
            }
            queryService.ensureLifeSelfNode();

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("ok", true);
            out.put("nodes", queryService.listLifeNodes());
            return out;
        } catch (Exception error) {
            throw new ApiException(500, messageOr(error, "清空失败"));
        }
    }

    // ==================== GET /api/life/plan/rejects（server.js 9043） ====================

    public Map<String, Object> listRejects() {
        try {
            List<Map<String, Object>> items = new ArrayList<>();
            for (Map<String, Object> row : rejectMapper.selectAll()) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("title", row.get("title"));
                item.put("kind", row.get("kind"));
                item.put("createdAt", (long) JsValues.parseOrZero(row.get("created_at")));
                items.add(item);
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("items", items);
            return out;
        } catch (Exception error) {
            throw new ApiException(500, messageOr(error, "读取失败"));
        }
    }

    // ==================== DELETE /api/life/plan/rejects（server.js 9051） ====================

    public Map<String, Object> restoreReject(Map<String, Object> body) {
        try {
            String title = support.lifeText(body == null ? null : body.get("title"), 200);
            if (!title.isEmpty()) {
                rejectMapper.deleteByTitle(title);
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("ok", true);
            return out;
        } catch (Exception error) {
            throw new ApiException(500, messageOr(error, "加回失败"));
        }
    }

    // ==================== DELETE /api/life/chat（server.js 9062） ====================

    public Map<String, Object> clearChat() {
        try {
            chatMapper.deleteAll();
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("ok", true);
            return out;
        } catch (Exception error) {
            throw new ApiException(500, messageOr(error, "清空失败"));
        }
    }

    // ==================== DELETE /api/life/data（server.js 9080） ====================

    public Map<String, Object> resetAll() {
        try {
            int cleared = 0;
            for (String table : LIFE_WIPE_TABLES) {
                try {
                    purgeMapper.deleteAllFromTable(table);
                    cleared += 1;
                } catch (Exception error) {
                    log.warn("[life-reset] 清空 {} 失败：{}", table, error.getMessage());
                }
            }
            queryService.ensureLifeSelfNode();
            log.info("[life-reset] 已重置人生规划模块：{}/{} 张表清空", cleared, LIFE_WIPE_TABLES.size());

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("ok", true);
            out.put("cleared", cleared);
            out.put("total", LIFE_WIPE_TABLES.size());
            out.put("nodes", queryService.listLifeNodes());
            return out;
        } catch (Exception error) {
            throw new ApiException(500, messageOr(error, "重置失败"));
        }
    }

    // ==================== 内部工具 ====================

    private Map<String, Object> nodesOut() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("nodes", queryService.listLifeNodes());
        return out;
    }

    /** 等价 {@code JSON.stringify(Array.isArray(x) ? x.map(String).filter(Boolean) : [])}。 */
    private String referenceIdsJson(Object value) {
        List<String> ids = new ArrayList<>();
        if (value instanceof List<?> list) {
            for (Object item : list) {
                String text = jsString(item);
                if (JsValues.truthy(text)) {
                    ids.add(text);
                }
            }
        }
        return support.jsonStringify(ids, null);
    }

    /** 等价 JS {@code String(value)}（null → "null"）。 */
    private static String jsString(Object value) {
        return value == null ? "null" : JsValues.toJsString(value);
    }

    /** 等价 {@code a || b || fallback}：返回第一个真值，全部为假时返回 fallback。 */
    private static Object firstTruthy(Object... values) {
        for (Object value : values) {
            if (JsValues.truthy(value)) {
                return value;
            }
        }
        return "";
    }

    private static String messageOr(Exception error, String fallback) {
        String message = error.getMessage();
        return message == null || message.isEmpty() ? fallback : message;
    }
}
