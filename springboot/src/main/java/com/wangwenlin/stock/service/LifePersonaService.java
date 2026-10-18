package com.wangwenlin.stock.service;

import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.common.Ids;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.mapper.LifeFuturePathMapper;
import com.wangwenlin.stock.mapper.LifePersonaMapper;
import com.wangwenlin.stock.mapper.LifeRetrievalBatchMapper;
import com.wangwenlin.stock.mapper.LifeRetrievalCacheMapper;
import com.wangwenlin.stock.mapper.LifeRetrievalLogMapper;
import com.wangwenlin.stock.mapper.LifeRetrievalQueueMapper;
import com.wangwenlin.stock.support.LifeSupport;
import com.wangwenlin.stock.tenant.UserContext;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 人生规划器「人物画像 / 未来路径库 / 资料检索」子集 —— 逐行对齐 server.js：
 * GET /api/life/persona(9903)、PUT /api/life/persona(9919)、POST /api/life/persona/derived/refresh(9953)、
 * GET /api/life/paths(9984)、POST /api/life/paths(9993)、PUT /api/life/paths/:id(10009)、
 * DELETE /api/life/paths/:id(10033)、GET /api/life/retrieval/queue(9531)、
 * POST /api/life/retrieval/collect(9547)、GET /api/life/retrieval/batches(9560)、
 * POST /api/life/retrieval/batches/:id/decide(9580)、GET /api/life/retrieval/bill(9628)。
 */
@Service
public class LifePersonaService {

    private static final DateTimeFormatter UTC_STAMP = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final List<String> DECIDE_MODES = List.of("all", "partial", "reject");

    private final LifeQueryService lifeQueryService;
    private final LifePersonaMapper personaMapper;
    private final LifeFuturePathMapper pathMapper;
    private final LifeRetrievalQueueMapper queueMapper;
    private final LifeRetrievalBatchMapper batchMapper;
    private final LifeRetrievalCacheMapper cacheMapper;
    private final LifeRetrievalLogMapper retrievalLogMapper;
    private final LifeSupport support;
    private final WebSearchService webSearchService;

    public LifePersonaService(LifeQueryService lifeQueryService,
                              LifePersonaMapper personaMapper,
                              LifeFuturePathMapper pathMapper,
                              LifeRetrievalQueueMapper queueMapper,
                              LifeRetrievalBatchMapper batchMapper,
                              LifeRetrievalCacheMapper cacheMapper,
                              LifeRetrievalLogMapper retrievalLogMapper,
                              LifeSupport support,
                              WebSearchService webSearchService) {
        this.lifeQueryService = lifeQueryService;
        this.personaMapper = personaMapper;
        this.pathMapper = pathMapper;
        this.queueMapper = queueMapper;
        this.batchMapper = batchMapper;
        this.cacheMapper = cacheMapper;
        this.retrievalLogMapper = retrievalLogMapper;
        this.support = support;
        this.webSearchService = webSearchService;
    }

    // ==================================================================
    // 人物画像
    // ==================================================================

    /** 等价 GET /api/life/persona（9903）。 */
    public Map<String, Object> getPersona() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("persona", support.lifePersonaOut(lifeQueryService.readLifePersonaRow()));
        out.put("dims", dimLabels(LifeSupport.LIFE_PERSONA_DIMS));
        out.put("derived", support.lifeDerivedOut(lifeQueryService.readLifeDerivedRow()));
        out.put("derivedDims", dimLabels(LifeSupport.LIFE_PERSONA_DERIVED_DIMS));
        return out;
    }

    /** 等价 PUT /api/life/persona（9919）。 */
    public Map<String, Object> putPersona(Map<String, Object> bodyValue) {
        Map<String, Object> body = bodyValue == null ? Map.of() : bodyValue;
        long now = System.currentTimeMillis();
        Map<String, Object> row = lifeQueryService.readLifePersonaRow();
        if (row == null) {
            personaMapper.insertPersona(Ids.uuid(), "user", now, now);
            row = lifeQueryService.readLifePersonaRow();
        }
        Map<String, Object> fields = new LinkedHashMap<>();
        for (Map<String, Object> dim : LifeSupport.LIFE_PERSONA_DIMS) {
            String key = str(dim.get("key"));
            if (body.containsKey(key)) {
                fields.put(str(dim.get("col")), support.lifeText(body.get(key), 6000));
            }
        }
        // 本次没有任何维度字段 → 直接回吐当前画像，不写库（对齐 Node 的 !fields.length 提前返回）
        if (fields.isEmpty()) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("persona", support.lifePersonaOut(row));
            return out;
        }
        fields.put("source", "user");
        fields.put("updated_at", now);
        fields.put("id", str(row.get("id")));
        personaMapper.updatePersona(fields);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("persona", support.lifePersonaOut(lifeQueryService.readLifePersonaRow()));
        return out;
    }

    /** 等价 POST /api/life/persona/derived/refresh（9953）。 */
    public Map<String, Object> refreshDerived(Map<String, Object> bodyValue) {
        Map<String, Object> body = bodyValue == null ? Map.of() : bodyValue;
        String reason = support.lifeText(body.get("reason"), 40);
        if (reason.isEmpty()) {
            reason = "面板刷新";
        }
        Map<String, Object> derived = lifeQueryService.deriveLifePersona(reason);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("derived", derived != null ? derived : support.lifeDerivedOut(lifeQueryService.readLifeDerivedRow()));
        out.put("derivedDims", dimLabels(LifeSupport.LIFE_PERSONA_DERIVED_DIMS));
        return out;
    }

    // ==================================================================
    // 未来路径库
    // ==================================================================

    /** 等价 GET /api/life/paths（9984）。 */
    public Map<String, Object> listPaths() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", lifeQueryService.listLifePaths());
        return out;
    }

    /** 等价 POST /api/life/paths（9993）。 */
    public Map<String, Object> createPath(Map<String, Object> bodyValue) {
        Map<String, Object> body = bodyValue == null ? Map.of() : bodyValue;
        long now = System.currentTimeMillis();
        String id = Ids.uuid();
        String source = support.lifeText(body.get("source"), 8);
        Map<String, Object> path = new LinkedHashMap<>();
        path.put("id", id);
        path.put("name", support.lifeText(body.get("name"), 120));
        path.put("advantages", support.lifeText(body.get("advantages"), 4000));
        path.put("risks", support.lifeText(body.get("risks"), 4000));
        path.put("prerequisites", support.lifeText(body.get("prerequisites"), 2000));
        path.put("evolution", support.lifeText(body.get("evolution"), 4000));
        path.put("score", clampScore(body.get("score")));
        path.put("node_id", support.lifeText(body.get("nodeId"), 64));
        path.put("source", source.isEmpty() ? "user" : source);
        path.put("sort_order", clampSort(body.get("sortOrder")));
        path.put("created_at", now);
        path.put("updated_at", now);
        pathMapper.insertPath(path);
        return listPaths();
    }

    /** 等价 PUT /api/life/paths/:id（10009）。 */
    public Map<String, Object> updatePath(String id, Map<String, Object> bodyValue) {
        Map<String, Object> body = bodyValue == null ? Map.of() : bodyValue;
        Map<String, Object> fields = new LinkedHashMap<>();
        if (body.containsKey("name")) {
            fields.put("name", support.lifeText(body.get("name"), 120));
        }
        if (body.containsKey("advantages")) {
            fields.put("advantages", support.lifeText(body.get("advantages"), 4000));
        }
        if (body.containsKey("risks")) {
            fields.put("risks", support.lifeText(body.get("risks"), 4000));
        }
        if (body.containsKey("prerequisites")) {
            fields.put("prerequisites", support.lifeText(body.get("prerequisites"), 4000));
        }
        if (body.containsKey("evolution")) {
            fields.put("evolution", support.lifeText(body.get("evolution"), 4000));
        }
        if (body.containsKey("nodeId")) {
            fields.put("node_id", support.lifeText(body.get("nodeId"), 4000));
        }
        if (body.containsKey("score")) {
            fields.put("score", clampScore(body.get("score")));
        }
        if (body.containsKey("sortOrder")) {
            fields.put("sort_order", clampSort(body.get("sortOrder")));
        }
        if (fields.isEmpty()) {
            return listPaths();
        }
        fields.put("updated_at", System.currentTimeMillis());
        fields.put("id", str(id));
        pathMapper.updatePath(fields);
        return listPaths();
    }

    /** 等价 DELETE /api/life/paths/:id（10033）。 */
    public Map<String, Object> deletePath(String id) {
        pathMapper.deleteById(str(id));
        return listPaths();
    }

    // ==================================================================
    // 资料检索审批工作流
    // ==================================================================

    /** 等价 GET /api/life/retrieval/queue（9531）。 */
    public Map<String, Object> retrievalQueue() {
        List<Map<String, Object>> rows = queueMapper.selectRecent(120);
        List<Map<String, Object>> tasks = new ArrayList<>();
        int pendingCount = 0;
        for (Map<String, Object> row : rows) {
            Map<String, Object> task = new LinkedHashMap<>();
            task.put("id", row.get("id"));
            task.put("batchId", row.get("batch_id"));
            task.put("nodeId", row.get("node_id"));
            task.put("series", row.get("series"));
            task.put("title", row.get("title"));
            task.put("query", row.get("query"));
            task.put("priority", row.get("priority"));
            task.put("estCost", LifeSupport.numOr(row.get("est_cost"), 0));
            task.put("status", row.get("status"));
            task.put("result", LifeSupport.orEmpty(row.get("result")));
            task.put("fromCache", LifeSupport.numEquals(row.get("from_cache"), 1));
            task.put("createdAt", LifeSupport.numOr(row.get("created_at"), 0));
            task.put("decidedAt", LifeSupport.numOr(row.get("decided_at"), 0));
            tasks.add(task);
            if ("pending".equals(str(row.get("status")))) {
                pendingCount += 1;
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("tasks", tasks);
        out.put("pendingCount", pendingCount);
        return out;
    }

    /** 等价 POST /api/life/retrieval/collect（9547）。 */
    public Map<String, Object> collect() {
        Map<String, Object> out = new LinkedHashMap<>();
        String batchId = collectLifeRetrievalBatch();
        if (batchId == null) {
            out.put("batch", null);
            out.put("message", "当前没有待归集的检索需求");
            return out;
        }
        Map<String, Object> row = batchMapper.selectById(batchId);
        Map<String, Object> batch = new LinkedHashMap<>();
        batch.put("id", row.get("id"));
        batch.put("batchNo", row.get("batch_no"));
        batch.put("taskCount", LifeSupport.numOr(row.get("task_count"), 0));
        batch.put("estCost", LifeSupport.numOr(row.get("est_cost"), 0));
        batch.put("status", row.get("status"));
        batch.put("createdAt", LifeSupport.numOr(row.get("created_at"), 0));
        out.put("batch", batch);
        out.put("message", "已归集 " + str(row.get("task_count"))
                + " 条待检索，预估费用 " + toFixed2(LifeSupport.numOr(row.get("est_cost"), 0)) + " 元，等待审批");
        return out;
    }

    /** 等价 GET /api/life/retrieval/batches（9560）。 */
    public Map<String, Object> retrievalBatches() {
        List<Map<String, Object>> rows = batchMapper.selectRecent(40);
        Map<String, List<Object>> byBatch = new LinkedHashMap<>();
        for (Map<String, Object> item : queueMapper.selectBatchPairs()) {
            byBatch.computeIfAbsent(str(item.get("batch_id")), key -> new ArrayList<>()).add(item.get("id"));
        }
        List<Map<String, Object>> batches = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> batch = new LinkedHashMap<>();
            batch.put("id", row.get("id"));
            batch.put("batchNo", row.get("batch_no"));
            batch.put("taskCount", LifeSupport.numOr(row.get("task_count"), 0));
            batch.put("estCost", LifeSupport.numOr(row.get("est_cost"), 0));
            batch.put("actualCost", LifeSupport.numOr(row.get("actual_cost"), 0));
            batch.put("status", row.get("status"));
            batch.put("createdAt", LifeSupport.numOr(row.get("created_at"), 0));
            batch.put("decidedAt", LifeSupport.numOr(row.get("decided_at"), 0));
            batch.put("taskIds", byBatch.getOrDefault(str(row.get("id")), new ArrayList<>()));
            batches.add(batch);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("batches", batches);
        return out;
    }

    /** 等价 POST /api/life/retrieval/batches/:id/decide（9580）。 */
    public Map<String, Object> decide(String idValue, Map<String, Object> bodyValue) {
        Map<String, Object> body = bodyValue == null ? Map.of() : bodyValue;
        Object modeRaw = body.get("mode");
        String mode = "reject";
        if (modeRaw instanceof String candidate && DECIDE_MODES.contains(candidate)) {
            mode = candidate;
        }
        Map<String, Object> batch = batchMapper.selectById(str(idValue));
        if (batch == null) {
            throw ApiException.notFound("批次不存在");
        }
        String batchId = str(batch.get("id"));
        List<Map<String, Object>> pendingRows = queueMapper.listPendingByBatch(batchId);
        long now = System.currentTimeMillis();

        // 全部驳回：本次一律不检索，任务保留在队列里，后续可再审
        if ("reject".equals(mode)) {
            queueMapper.rejectPendingByBatch(batchId, now);
            batchMapper.updateStatus(batchId, "rejected", 0, now);
            lifeQueryService.logLifeRetrieval(batchId, "reject",
                    "驳回 " + pendingRows.size() + " 条检索需求，费用 0 元", 0);
            Map<String, Object> rejectBatch = new LinkedHashMap<>();
            rejectBatch.put("id", batch.get("id"));
            rejectBatch.put("batchNo", batch.get("batch_no"));
            rejectBatch.put("status", "rejected");
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("batch", rejectBatch);
            out.put("executed", 0);
            out.put("cost", 0);
            out.put("message", "已驳回 " + pendingRows.size() + " 条，任务保留在队列中可再审");
            return out;
        }

        // partial：只执行勾选的条目，其余退回待定状态（脱离本批次，留待下次审批）
        Set<String> picked = null;
        if ("partial".equals(mode)) {
            picked = new LinkedHashSet<>();
            Object idsRaw = body.get("ids");
            if (idsRaw instanceof List<?> idList) {
                for (Object item : idList) {
                    picked.add(JsValues.toJsString(item));
                }
            }
            if (picked.isEmpty()) {
                throw ApiException.badRequest("请至少勾选一条需要检索的条目");
            }
        }
        List<Map<String, Object>> selected = new ArrayList<>();
        List<String> restIds = new ArrayList<>();
        for (Map<String, Object> row : pendingRows) {
            String rowId = str(row.get("id"));
            if (picked == null || picked.contains(rowId)) {
                selected.add(row);
            } else {
                restIds.add(rowId);
            }
        }
        if (!restIds.isEmpty()) {
            queueMapper.detachFromBatch(restIds, now);
        }

        // 批量执行：逐条先查缓存，未命中才联网；任一失败不影响其余
        double cost = 0;
        int cachedHits = 0;
        for (Map<String, Object> row : selected) {
            try {
                Map<String, Object> outcome = executeLifeRetrieval(row);
                cost += LifeSupport.numOr(outcome.get("cost"), 0);
                if (JsValues.truthy(outcome.get("fromCache"))) {
                    cachedHits += 1;
                }
            } catch (Exception error) {
                queueMapper.markFailed(str(row.get("id")), support.lifeText(message(error), 400),
                        System.currentTimeMillis());
            }
        }
        String status = "partial".equals(mode) && !restIds.isEmpty() ? "partial" : "done";
        batchMapper.updateStatus(batchId, status, cost, now);
        lifeQueryService.logLifeRetrieval(batchId, "all".equals(mode) ? "approve_all" : "approve_partial",
                "执行 " + selected.size() + " 条检索（缓存命中 " + cachedHits + " 条），实际费用 " + toFixed2(cost) + " 元", cost);

        Map<String, Object> doneBatch = new LinkedHashMap<>();
        doneBatch.put("id", batch.get("id"));
        doneBatch.put("batchNo", batch.get("batch_no"));
        doneBatch.put("status", status);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("batch", doneBatch);
        out.put("executed", selected.size());
        out.put("cachedHits", cachedHits);
        out.put("cost", cost);
        out.put("message", "已执行 " + selected.size() + " 条检索"
                + (cachedHits > 0 ? "（" + cachedHits + " 条命中缓存，未扣费）" : "")
                + "，实际费用 " + toFixed2(cost) + " 元");
        return out;
    }

    /** 等价 GET /api/life/retrieval/bill（9628）。 */
    public Map<String, Object> retrievalBill() {
        List<Map<String, Object>> logs = new ArrayList<>();
        for (Map<String, Object> row : retrievalLogMapper.selectRecent(80)) {
            Map<String, Object> log = new LinkedHashMap<>();
            log.put("id", row.get("id"));
            log.put("batchId", row.get("batch_id"));
            log.put("action", row.get("action"));
            log.put("detail", row.get("detail"));
            log.put("cost", LifeSupport.numOr(row.get("cost"), 0));
            log.put("createdAt", LifeSupport.numOr(row.get("created_at"), 0));
            logs.add(log);
        }
        Map<String, Object> totals = batchMapper.billingTotals();
        Map<String, Object> cache = cacheMapper.selectStats();
        Map<String, Object> pending = queueMapper.countByStatus("pending");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("logs", logs);
        out.put("totalBatches", LifeSupport.numOr(totals.get("n"), 0));
        out.put("totalCost", LifeSupport.numOr(totals.get("cost"), 0));
        out.put("cacheEntries", LifeSupport.numOr(cache.get("n"), 0));
        out.put("cacheHits", LifeSupport.numOr(cache.get("hits"), 0));
        out.put("pendingCount", LifeSupport.numOr(pending.get("n"), 0));
        return out;
    }

    // ==================================================================
    // 内部：归集 / 执行检索
    // ==================================================================

    /** 等价 server.js 7814 的 collectLifeRetrievalBatch，返回批次 id（无待归集返回 null）。 */
    private String collectLifeRetrievalBatch() {
        long now = System.currentTimeMillis();
        List<Map<String, Object>> pending = queueMapper.listPendingUnbatched();
        if (pending.isEmpty()) {
            return null;
        }
        String batchId = Ids.uuid();
        double est = 0;
        List<String> ids = new ArrayList<>();
        for (Map<String, Object> row : pending) {
            est += LifeSupport.numOr(row.get("est_cost"), 0);
            ids.add(str(row.get("id")));
        }
        Map<String, Object> seq = batchMapper.countAll();
        String stamp = LocalDate.now(ZoneOffset.UTC).format(UTC_STAMP);
        String batchNo = "B" + stamp + "-" + pad3((long) LifeSupport.numOr(seq.get("n"), 0) + 1);
        batchMapper.insertBatch(batchId, batchNo, pending.size(), est, 0, "pending", now, 0);
        queueMapper.attachBatch(ids, batchId, now);
        lifeQueryService.logLifeRetrieval(batchId, "collect",
                "归集 " + pending.size() + " 条待检索，预估费用 " + toFixed2(est) + " 元", est);
        return batchId;
    }

    /**
     * 等价 server.js 7834 的 executeLifeRetrieval：先查缓存，未命中才真正联网，结果永久写回缓存。
     * 返回 {cost, fromCache}。
     */
    private Map<String, Object> executeLifeRetrieval(Map<String, Object> task) {
        String query = str(task.get("query"));
        String cached = lifeQueryService.lifeCacheLookup(query);
        Map<String, Object> out = new LinkedHashMap<>();
        if (cached != null && !cached.isEmpty()) {
            queueMapper.markDone(str(task.get("id")), cached, 1, System.currentTimeMillis());
            out.put("cost", 0);
            out.put("fromCache", true);
            return out;
        }
        String text = lifeWebSearch(query);
        String result = support.lifeText(text, 4000);
        lifeQueryService.lifeCacheStore(query, result);
        queueMapper.markDone(str(task.get("id")), result, 0, System.currentTimeMillis());
        out.put("cost", LifeSupport.numOr(task.get("est_cost"), LifeSupport.LIFE_RETRIEVAL_EST_COST));
        out.put("fromCache", false);
        return out;
    }

    /**
     * 等价 server.js 7840 的 webSearch 调用：{@code webSearch(query, { userId, getSecret: getUserSecret })}，
     * 再把结果经 formatSearchContext 压缩成可读文本（真实检索执行器见 {@link WebSearchService}）。
     */
    private String lifeWebSearch(String query) {
        UserContext.CurrentUser current = UserContext.current();
        String userId = current == null ? "" : String.valueOf(current.id());
        Object found = webSearchService.multiSearch(query, userId, webSearchService.userSecretProvider());
        return found instanceof String text ? text : webSearchService.formatSearchContext(found);
    }

    // ==================================================================
    // 内部工具
    // ==================================================================

    /** 把维度定义映射成 {key,label,hint}（对齐 Node 的解构重排）。 */
    private static List<Map<String, Object>> dimLabels(List<Map<String, Object>> dims) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> dim : dims) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("key", dim.get("key"));
            item.put("label", dim.get("label"));
            item.put("hint", dim.get("hint"));
            result.add(item);
        }
        return result;
    }

    /** 等价 {@code Math.max(0, Math.min(100, Math.round(Number(value) || 0)))}。 */
    private static int clampScore(Object value) {
        long rounded = Math.round(LifeSupport.numOr(value, 0));
        return (int) Math.max(0L, Math.min(100L, rounded));
    }

    /** 等价 {@code Math.max(0, Math.round(Number(value) || 0))}。 */
    private static int clampSort(Object value) {
        long rounded = Math.round(LifeSupport.numOr(value, 0));
        return (int) Math.max(0L, rounded);
    }

    /** 等价 {@code String(n).padStart(3, '0')}。 */
    private static String pad3(long value) {
        String text = Long.toString(value);
        while (text.length() < 3) {
            text = "0" + text;
        }
        return text;
    }

    /** 等价 JS {@code number.toFixed(2)}。 */
    private static String toFixed2(double value) {
        return String.format(java.util.Locale.ROOT, "%.2f", value);
    }

    private static String str(Object value) {
        return value == null ? "" : JsValues.toJsString(value);
    }

    private static String message(Exception error) {
        return error.getMessage() == null ? "" : error.getMessage();
    }
}
