package com.wangwenlin.stock.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.common.Ids;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.mapper.LifeCalendarEventMapper;
import com.wangwenlin.stock.mapper.LifeChangeLogMapper;
import com.wangwenlin.stock.mapper.LifeDailyTaskMapper;
import com.wangwenlin.stock.mapper.LifeEnergyLogMapper;
import com.wangwenlin.stock.mapper.LifeKnowledgeMapper;
import com.wangwenlin.stock.mapper.LifePlanNodeMapper;
import com.wangwenlin.stock.mapper.LifePlanSnapshotMapper;
import com.wangwenlin.stock.mapper.LifeSkillProfileMapper;
import com.wangwenlin.stock.support.LifeSupport;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * 人生规划器「领域数据 CRUD」子集 —— 与 server.js 9373-10216 的 26 条路由逐行对齐。
 * 所有响应字段名与顺序、状态码、错误文案、|| 默认值、Number() 语义均与 Node 保持一致。
 */
@Service
public class LifeDomainService {

    /** server.js 9397/9422/9657/9660/9683 反复出现的受影响模块列表。 */
    private static final List<String> TASK_MODULES =
            List.of("每日任务", "进度快照", "精力负荷", "重点提醒", "变更日志");
    private static final List<String> KNOWLEDGE_MODULES =
            List.of("知识库", "变更日志", "重点提醒");
    private static final List<String> EVENT_MODULES =
            List.of("外部事件", "变更日志", "重点提醒");
    /** server.js 9668 反向同步允许回写的节点状态集。 */
    private static final List<String> NODE_SYNC_STATUSES = List.of("done", "doing", "todo", "drop");
    /** server.js 9753 快照节点存档允许的状态集（注意不含 delay）。 */
    private static final List<String> SNAPSHOT_NODE_STATUS = List.of("todo", "doing", "done", "drop");
    private static final List<String> EVENT_LEVELS = List.of("high", "mid", "low");

    private final LifeDailyTaskMapper taskMapper;
    private final LifePlanSnapshotMapper snapshotMapper;
    private final LifeEnergyLogMapper energyMapper;
    private final LifeSkillProfileMapper skillMapper;
    private final LifeKnowledgeMapper knowledgeMapper;
    private final LifeCalendarEventMapper eventMapper;
    private final LifeChangeLogMapper changeLogMapper;
    private final LifePlanNodeMapper nodeMapper;
    private final LifeSupport support;
    private final LifeQueryService queryService;
    private final ObjectMapper objectMapper;

    public LifeDomainService(LifeDailyTaskMapper taskMapper,
                             LifePlanSnapshotMapper snapshotMapper,
                             LifeEnergyLogMapper energyMapper,
                             LifeSkillProfileMapper skillMapper,
                             LifeKnowledgeMapper knowledgeMapper,
                             LifeCalendarEventMapper eventMapper,
                             LifeChangeLogMapper changeLogMapper,
                             LifePlanNodeMapper nodeMapper,
                             LifeSupport support,
                             LifeQueryService queryService,
                             ObjectMapper objectMapper) {
        this.taskMapper = taskMapper;
        this.snapshotMapper = snapshotMapper;
        this.energyMapper = energyMapper;
        this.skillMapper = skillMapper;
        this.knowledgeMapper = knowledgeMapper;
        this.eventMapper = eventMapper;
        this.changeLogMapper = changeLogMapper;
        this.nodeMapper = nodeMapper;
        this.support = support;
        this.queryService = queryService;
        this.objectMapper = objectMapper;
    }

    // ==================================================================
    // 每日任务 9373 / 9382 / 9405 / 9643 / 9679
    // ==================================================================

    /** GET /api/life/tasks：date / from / to 三档过滤。 */
    public Map<String, Object> listTasks(String date, String from, String to) {
        Map<String, Object> range = new LinkedHashMap<>();
        range.put("date", LifeSupport.orEmpty(date));
        range.put("from", LifeSupport.orEmpty(from));
        range.put("to", LifeSupport.orEmpty(to));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("tasks", queryService.listLifeTasks(range));
        return out;
    }

    /** POST /api/life/tasks。 */
    public Map<String, Object> createTask(Map<String, Object> raw) {
        Map<String, Object> body = body(raw);
        String id = Ids.uuid();
        long now = System.currentTimeMillis();
        String priority = pick(body.get("priority"), LifeSupport.LIFE_TASK_PRIORITY, "P1");
        String status = pick(body.get("status"), LifeSupport.LIFE_TASK_STATUS, "todo");
        String title = support.lifeText(body.get("title"), 200);
        String repeatType = support.lifeRepeatType(body.get("repeat"), title);
        String date = support.lifeText(body.get("date"), 10);
        if (date.isEmpty()) {
            date = support.todayStr();
        }
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", id);
        row.put("task_date", date);
        row.put("title", title);
        row.put("est_minutes", numMax0(body.get("estMinutes")));
        row.put("priority", priority);
        row.put("status", status);
        row.put("pre_task", support.lifeText(body.get("preTask"), 120));
        row.put("blocker", support.lifeText(body.get("blocker"), 200));
        row.put("support", support.lifeText(body.get("support"), 200));
        row.put("node_id", support.lifeText(body.get("nodeId"), 64));
        row.put("repeat_type", repeatType);
        row.put("sort_order", numMax0(body.get("sortOrder")));
        row.put("created_at", now);
        row.put("updated_at", now);
        taskMapper.insertTask(row);
        queryService.refreshLifeDerived("每日任务", TASK_MODULES, "面板手动新增",
                "新增任务「" + support.lifeText(body.get("title"), 60) + "」");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("tasks", queryService.listLifeTasks());
        return out;
    }

    /** PUT /api/life/tasks/:id。 */
    public Map<String, Object> updateTask(String id, Map<String, Object> raw) {
        Map<String, Object> body = body(raw);
        Map<String, Object> data = new LinkedHashMap<>();
        if (body.containsKey("date")) {
            data.put("task_date", support.lifeText(body.get("date"), 10));
        }
        if (body.containsKey("title")) {
            data.put("title", support.lifeText(body.get("title"), 200));
        }
        if (body.containsKey("estMinutes")) {
            data.put("est_minutes", numMax0(body.get("estMinutes")));
        }
        if (body.containsKey("priority")) {
            data.put("priority", pick(body.get("priority"), LifeSupport.LIFE_TASK_PRIORITY, "P1"));
        }
        if (body.containsKey("preTask")) {
            data.put("pre_task", support.lifeText(body.get("preTask"), 200));
        }
        if (body.containsKey("blocker")) {
            data.put("blocker", support.lifeText(body.get("blocker"), 200));
        }
        if (body.containsKey("support")) {
            data.put("support", support.lifeText(body.get("support"), 200));
        }
        if (body.containsKey("nodeId")) {
            data.put("node_id", support.lifeText(body.get("nodeId"), 200));
        }
        if (body.containsKey("repeat")) {
            data.put("repeat_type", support.lifeRepeatType(body.get("repeat"), body.get("title")));
        }
        if (body.containsKey("sortOrder")) {
            data.put("sort_order", numMax0(body.get("sortOrder")));
        }
        if (!data.isEmpty()) {
            data.put("updated_at", System.currentTimeMillis());
            data.put("id", id);
            taskMapper.updateTaskFields(data);
            Object name = JsValues.truthy(body.get("title")) ? body.get("title") : id;
            queryService.refreshLifeDerived("每日任务", TASK_MODULES, "面板手动修改",
                    "修改任务「" + support.lifeText(name, 60) + "」");
        }
        return tasksResult();
    }

    /** POST /api/life/tasks/:id/state。 */
    public Map<String, Object> updateTaskState(String id, Map<String, Object> raw) {
        Map<String, Object> body = body(raw);
        String status = pick(body.get("status"), LifeSupport.LIFE_TASK_STATUS, "todo");
        Map<String, Object> task = taskMapper.selectById(id);
        if (task == null) {
            throw ApiException.notFound("任务不存在");
        }
        long now = System.currentTimeMillis();
        String previous = LifeSupport.str(task.get("status"));
        String title = LifeSupport.str(task.get("title"));
        if ("delay".equals(status)) {
            String base = LifeSupport.str(task.get("task_date"));
            if (base.isEmpty()) {
                base = support.todayStr();
            }
            for (Map<String, Object> item : taskMapper.selectLaterTasks(base, LifeSupport.str(task.get("id")))) {
                taskMapper.updateTaskDate(LifeSupport.str(item.get("id")),
                        support.lifeDateShift(item.get("task_date"), 1), now);
            }
            taskMapper.updateStatusAndDate(id, status, support.lifeDateShift(base, 1), now);
            queryService.refreshLifeDerived("每日任务", TASK_MODULES, "任务未按时完成",
                    "任务「" + support.lifeText(title, 60) + "」延期，同日及之后任务整体顺延一天");
        } else {
            taskMapper.updateStatus(id, status, now);
            queryService.refreshLifeDerived("每日任务", TASK_MODULES, "面板手动更新",
                    "任务「" + support.lifeText(title, 60) + "」状态改为 " + status);
        }
        // 状态驱动推演（server.js 9663-9665）依赖未迁移的 applyLifeOps，此处不触发。
        // 反向同步：绑定过规划节点时把状态回写到对应节点（server.js 9667-9671）。
        if (!status.equals(previous) && JsValues.truthy(task.get("node_id"))) {
            String nodeStatus = NODE_SYNC_STATUSES.contains(status) ? status : "doing";
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("id", LifeSupport.str(task.get("node_id")));
            data.put("status", nodeStatus);
            data.put("updated_at", now);
            nodeMapper.updateNodeFields(data);
        }
        return tasksResult();
    }

    /** DELETE /api/life/tasks/:id。 */
    public Map<String, Object> deleteTask(String id) {
        Map<String, Object> row = taskMapper.selectTitleById(id);
        taskMapper.deleteById(id);
        Object name = (row != null && JsValues.truthy(row.get("title"))) ? row.get("title") : id;
        queryService.refreshLifeDerived("每日任务", TASK_MODULES, "面板手动删除",
                "删除任务「" + support.lifeText(name, 60) + "」");
        return tasksResult();
    }

    // ==================================================================
    // 进度快照 9692 / 9702 / 9722 / 9734
    // ==================================================================

    /** GET /api/life/snapshots。 */
    public Map<String, Object> listSnapshots() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("snapshots", snapshotBriefs(snapshotMapper.selectRecent(60)));
        out.put("stats", queryService.lifeProgressStats());
        return out;
    }

    /** POST /api/life/snapshots。 */
    public Map<String, Object> createSnapshot(Map<String, Object> raw) {
        Map<String, Object> body = body(raw);
        String reason = support.lifeText(body.get("reason"), 200);
        if (reason.isEmpty()) {
            reason = "面板手动生成，覆盖当天记录";
        }
        queryService.refreshLifeDerived("任务进度快照", List.of("进度快照", "变更日志"), reason,
                "生成今日进度快照（覆盖同一天记录）");
        List<Map<String, Object>> rows = snapshotMapper.selectRecent(60);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("snapshot", rows.isEmpty() ? null : support.lifeSnapshotBrief(rows.get(0)));
        out.put("snapshots", snapshotBriefs(rows));
        return out;
    }

    /** GET /api/life/snapshots/:id。 */
    public Map<String, Object> getSnapshot(String id) {
        Map<String, Object> row = snapshotMapper.selectById(id);
        if (row == null) {
            throw ApiException.notFound("快照不存在");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("snapshot", support.lifeSnapshotOut(row));
        return out;
    }

    /** POST /api/life/snapshots/:id/restore。 */
    public Map<String, Object> restoreSnapshot(String id) {
        Map<String, Object> row = snapshotMapper.selectById(id);
        if (row == null) {
            throw ApiException.notFound("快照不存在");
        }
        String snapDate = LifeSupport.str(row.get("snap_date"));
        Object payload;
        String rawPayload = LifeSupport.str(row.get("payload"));
        if (rawPayload.isEmpty()) {
            rawPayload = "{}";
        }
        try {
            payload = objectMapper.readValue(rawPayload, Object.class);
        } catch (Exception error) {
            payload = new LinkedHashMap<>();
        }
        List<Object> nodes = new ArrayList<>();
        if (payload instanceof Map<?, ?> map && map.get("nodes") instanceof List<?> list) {
            nodes.addAll(list);
        }
        if (nodes.isEmpty()) {
            throw new ApiException(400, "该快照没有存档规划节点，无法回退");
        }
        long now = System.currentTimeMillis();
        nodeMapper.deleteNonSelf();
        for (Object value : nodes) {
            Map<?, ?> node = value instanceof Map<?, ?> map ? map : new LinkedHashMap<>();
            if ("self".equals(LifeSupport.str(node.get("kind")))) {
                continue;
            }
            nodeMapper.insertNodeFromSnapshot(snapshotNodeRow(node, now));
        }
        queryService.logLifePanelChange("规划快照",
                "回退到 " + snapDate + " 的历史规划版本（" + nodes.size() + " 个节点）",
                "用户手动回退历史版本", List.of("规划网络"));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("restored", nodes.size());
        out.put("nodes", queryService.listLifeNodes());
        return out;
    }

    // ==================================================================
    // 精力负荷 9774 / 9784
    // ==================================================================

    /** GET /api/life/energy。 */
    public Map<String, Object> listEnergy() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("logs", energyOut(snapshotEnergyRows()));
        out.put("planned", queryService.lifePlannedMinutes(support.todayStr()));
        return out;
    }

    /** POST /api/life/energy。 */
    public Map<String, Object> saveEnergy(Map<String, Object> raw) {
        Map<String, Object> body = body(raw);
        String logDate = support.lifeText(body.get("date"), 10);
        if (logDate.isEmpty()) {
            logDate = support.todayStr();
        }
        Object plannedRaw = body.get("plannedMinutes");
        double planned = plannedRaw != null ? numMax0(plannedRaw) : queryService.lifePlannedMinutes(logDate);
        double capacity = numMax0(body.get("capacityMinutes"));
        int overload = (planned > capacity && capacity > 0) ? 1 : 0;
        String distractions = support.lifeText(body.get("distractions"), 200);
        double sleepHours = LifeSupport.numOr(body.get("sleepHours"), 0);
        String health = support.lifeText(body.get("health"), 100);
        String note = support.lifeText(body.get("note"), 1000);
        Map<String, Object> exist = energyMapper.selectByDate(logDate);
        if (exist != null) {
            energyMapper.updateEnergyFull(LifeSupport.str(exist.get("id")), planned, capacity, overload,
                    distractions, sleepHours, health, note);
        } else {
            energyMapper.insertEnergy(Ids.uuid(), logDate, planned, capacity, overload,
                    distractions, sleepHours, health, note, System.currentTimeMillis());
        }
        String reason = distractions.isEmpty() ? "面板手动记录" : distractions;
        queryService.refreshLifeDerived("精力负荷评估", List.of("精力负荷", "变更日志"), reason,
                "记录 " + logDate + "：计划 " + LifeSupport.str(planned) + " 分钟 / 上限 "
                        + LifeSupport.str(capacity) + " 分钟" + (overload != 0 ? "（超负荷）" : ""));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("logs", energyOut(snapshotEnergyRows()));
        out.put("planned", queryService.lifePlannedMinutes(support.todayStr()));
        return out;
    }

    // ==================================================================
    // 技能档案 9818 / 9828 / 9844 / 9870
    // ==================================================================

    /** GET /api/life/skills。 */
    public Map<String, Object> listSkills() {
        return skillsResult();
    }

    /** POST /api/life/skills。 */
    public Map<String, Object> createSkill(Map<String, Object> raw) {
        Map<String, Object> body = body(raw);
        long now = System.currentTimeMillis();
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", Ids.uuid());
        row.put("category", pick(body.get("category"), LifeSupport.LIFE_SKILL_CATEGORY, "own"));
        row.put("name", support.lifeText(body.get("name"), 120));
        row.put("level", support.lifeText(body.get("level"), 32));
        row.put("note", support.lifeText(body.get("note"), 200));
        row.put("sort_order", numMax0(body.get("sortOrder")));
        row.put("created_at", now);
        row.put("updated_at", now);
        skillMapper.insertSkill(row);
        queryService.logLifePanelChange("个人技能档案",
                "新增技能「" + support.lifeText(body.get("name"), 60) + "」", "面板手动新增", null);
        return skillsResult();
    }

    /** PUT /api/life/skills/:id。 */
    public Map<String, Object> updateSkill(String id, Map<String, Object> raw) {
        Map<String, Object> body = body(raw);
        Map<String, Object> data = new LinkedHashMap<>();
        if (body.containsKey("category")) {
            data.put("category", pick(body.get("category"), LifeSupport.LIFE_SKILL_CATEGORY, "own"));
        }
        if (body.containsKey("name")) {
            data.put("name", support.lifeText(body.get("name"), 200));
        }
        if (body.containsKey("level")) {
            data.put("level", support.lifeText(body.get("level"), 200));
        }
        if (body.containsKey("note")) {
            data.put("note", support.lifeText(body.get("note"), 200));
        }
        if (body.containsKey("sortOrder")) {
            data.put("sort_order", numMax0(body.get("sortOrder")));
        }
        if (!data.isEmpty()) {
            data.put("updated_at", System.currentTimeMillis());
            data.put("id", id);
            skillMapper.updateSkillFields(data);
            Object name = JsValues.truthy(body.get("name")) ? body.get("name") : id;
            queryService.logLifePanelChange("个人技能档案",
                    "修改技能「" + support.lifeText(name, 60) + "」", "面板手动修改", null);
        }
        return skillsResult();
    }

    /** DELETE /api/life/skills/:id。 */
    public Map<String, Object> deleteSkill(String id) {
        skillMapper.deleteById(id);
        return skillsResult();
    }

    // ==================================================================
    // 学习知识库 10044 / 10056 / 10075 / 10099 / 10113
    // ==================================================================

    /** GET /api/life/knowledge。 */
    public Map<String, Object> listKnowledge() {
        List<Map<String, Object>> items = knowledgeItems();
        String today = support.todayStr();
        List<Map<String, Object>> due = new ArrayList<>();
        for (Map<String, Object> item : items) {
            String next = LifeSupport.str(item.get("nextReviewDate"));
            if (!next.isEmpty() && next.compareTo(today) <= 0) {
                due.add(item);
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("due", due);
        return out;
    }

    /** POST /api/life/knowledge。 */
    public Map<String, Object> createKnowledge(Map<String, Object> raw) {
        Map<String, Object> body = body(raw);
        long now = System.currentTimeMillis();
        String baseDate = support.todayStr();
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", Ids.uuid());
        row.put("subject", support.lifeText(body.get("subject"), 32));
        row.put("topic", support.lifeText(body.get("topic"), 120));
        row.put("content", support.lifeText(body.get("content"), 4000));
        row.put("wrong_questions", support.lifeText(body.get("wrongQuestions"), 4000));
        row.put("tags", support.lifeText(body.get("tags"), 120));
        row.put("review_stage", 0);
        row.put("next_review_date", support.lifeNextReviewDate(baseDate, 0));
        String source = support.lifeText(body.get("source"), 16);
        row.put("source", source.isEmpty() ? "user" : source);
        row.put("created_at", now);
        row.put("updated_at", now);
        knowledgeMapper.insertKnowledge(row);
        queryService.refreshLifeDerived("个人学习知识库", KNOWLEDGE_MODULES, "面板手动新增",
                "新增知识点「" + support.lifeText(body.get("topic"), 60) + "」");
        return knowledgeResult();
    }

    /** PUT /api/life/knowledge/:id。 */
    public Map<String, Object> updateKnowledge(String id, Map<String, Object> raw) {
        Map<String, Object> body = body(raw);
        Map<String, Object> data = new LinkedHashMap<>();
        if (body.containsKey("subject")) {
            data.put("subject", support.lifeText(body.get("subject"), 120));
        }
        if (body.containsKey("topic")) {
            data.put("topic", support.lifeText(body.get("topic"), 4000));
        }
        if (body.containsKey("content")) {
            data.put("content", support.lifeText(body.get("content"), 4000));
        }
        if (body.containsKey("wrongQuestions")) {
            data.put("wrong_questions", support.lifeText(body.get("wrongQuestions"), 4000));
        }
        if (body.containsKey("tags")) {
            data.put("tags", support.lifeText(body.get("tags"), 120));
        }
        if (!data.isEmpty()) {
            data.put("updated_at", System.currentTimeMillis());
            data.put("id", id);
            knowledgeMapper.updateKnowledgeFields(data);
            Object name = JsValues.truthy(body.get("topic")) ? body.get("topic") : id;
            queryService.refreshLifeDerived("个人学习知识库", KNOWLEDGE_MODULES, "面板手动修改",
                    "修改知识点「" + support.lifeText(name, 60) + "」");
        }
        return knowledgeResult();
    }

    /** DELETE /api/life/knowledge/:id。 */
    public Map<String, Object> deleteKnowledge(String id) {
        Map<String, Object> row = knowledgeMapper.selectTopicById(id);
        knowledgeMapper.deleteById(id);
        Object name = (row != null && JsValues.truthy(row.get("topic"))) ? row.get("topic") : id;
        queryService.refreshLifeDerived("个人学习知识库", KNOWLEDGE_MODULES, "面板手动删除",
                "删除知识点「" + support.lifeText(name, 60) + "」");
        return knowledgeResult();
    }

    /** POST /api/life/knowledge/:id/review。 */
    public Map<String, Object> reviewKnowledge(String id) {
        Map<String, Object> item = knowledgeMapper.selectById(id);
        if (item == null) {
            throw ApiException.notFound("知识点不存在");
        }
        double stage = Math.min(LifeSupport.LIFE_REVIEW_OFFSETS.size() - 1,
                LifeSupport.numOr(item.get("review_stage"), 0) + 1);
        String baseDate = support.lifeDateOf(item.get("created_at"));
        String next = support.lifeNextReviewDate(baseDate, stage);
        knowledgeMapper.updateReviewStage(id, stage, next, System.currentTimeMillis());
        String reason = JsValues.truthy(next) ? "下次复习 " + next : "已掌握，退出复习队列";
        queryService.refreshLifeDerived("个人学习知识库", KNOWLEDGE_MODULES, reason,
                "推进复习「" + support.lifeText(item.get("topic"), 60) + "」至第 " + LifeSupport.str(stage) + " 阶段");
        return knowledgeResult();
    }

    // ==================================================================
    // 外部事件日历 10132 / 10142 / 10160 / 10185
    // ==================================================================

    /** GET /api/life/events。 */
    public Map<String, Object> listEvents() {
        return eventsResult();
    }

    /** POST /api/life/events。 */
    public Map<String, Object> createEvent(Map<String, Object> raw) {
        Map<String, Object> body = body(raw);
        long now = System.currentTimeMillis();
        String date = support.lifeText(body.get("date"), 10);
        String remindDays = support.lifeText(body.get("remindDays"), 32);
        if (remindDays.isEmpty()) {
            remindDays = "30,7,1";
        }
        String status = support.lifeText(body.get("status"), 16);
        if (status.isEmpty()) {
            status = "pending";
        }
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", Ids.uuid());
        row.put("title", support.lifeText(body.get("title"), 120));
        row.put("event_date", date);
        row.put("category", support.lifeText(body.get("category"), 32));
        row.put("level", pick(body.get("level"), EVENT_LEVELS, "mid"));
        row.put("remind_days", remindDays);
        row.put("status", status);
        row.put("note", support.lifeText(body.get("note"), 1000));
        row.put("created_at", now);
        row.put("updated_at", now);
        eventMapper.insertEvent(row);
        queryService.refreshLifeDerived("外部事件日历", EVENT_MODULES, "面板手动新增",
                "新增事件「" + support.lifeText(body.get("title"), 60) + "」"
                        + (date.isEmpty() ? "" : "，" + date));
        return eventsResult();
    }

    /** PUT /api/life/events/:id。 */
    public Map<String, Object> updateEvent(String id, Map<String, Object> raw) {
        Map<String, Object> body = body(raw);
        Map<String, Object> data = new LinkedHashMap<>();
        if (body.containsKey("title")) {
            data.put("title", support.lifeText(body.get("title"), 120));
        }
        if (body.containsKey("date")) {
            data.put("event_date", support.lifeText(body.get("date"), 120));
        }
        if (body.containsKey("category")) {
            data.put("category", support.lifeText(body.get("category"), 120));
        }
        if (body.containsKey("level")) {
            data.put("level", pick(body.get("level"), EVENT_LEVELS, "mid"));
        }
        if (body.containsKey("remindDays")) {
            data.put("remind_days", support.lifeText(body.get("remindDays"), 120));
        }
        if (body.containsKey("status")) {
            data.put("status", support.lifeText(body.get("status"), 120));
        }
        if (body.containsKey("note")) {
            data.put("note", support.lifeText(body.get("note"), 1000));
        }
        if (!data.isEmpty()) {
            data.put("updated_at", System.currentTimeMillis());
            data.put("id", id);
            eventMapper.updateEventFields(data);
            Object name = JsValues.truthy(body.get("title")) ? body.get("title") : id;
            queryService.refreshLifeDerived("外部事件日历", EVENT_MODULES, "面板手动修改",
                    "修改事件「" + support.lifeText(name, 60) + "」");
        }
        return eventsResult();
    }

    /** DELETE /api/life/events/:id。 */
    public Map<String, Object> deleteEvent(String id) {
        Map<String, Object> row = eventMapper.selectTitleById(id);
        eventMapper.deleteById(id);
        Object name = (row != null && JsValues.truthy(row.get("title"))) ? row.get("title") : id;
        queryService.refreshLifeDerived("外部事件日历", EVENT_MODULES, "面板手动删除",
                "删除事件「" + support.lifeText(name, 60) + "」");
        return eventsResult();
    }

    // ==================================================================
    // 变更日志 / 重点提醒 10199 / 10210
    // ==================================================================

    /** GET /api/life/changes。 */
    public Map<String, Object> listChanges() {
        List<Map<String, Object>> changes = new ArrayList<>();
        for (Map<String, Object> row : changeLogMapper.selectRecent(200)) {
            changes.add(support.lifeChangeOut(row));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("changes", changes);
        return out;
    }

    /** GET /api/life/alerts。 */
    public Map<String, Object> listAlerts() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("alerts", queryService.lifeAlerts());
        out.put("stats", queryService.lifeProgressStats());
        return out;
    }

    // ==================================================================
    // 内部工具
    // ==================================================================

    private Map<String, Object> tasksResult() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("tasks", queryService.listLifeTasks());
        return out;
    }

    private Map<String, Object> skillsResult() {
        List<Map<String, Object>> skills = new ArrayList<>();
        for (Map<String, Object> row : skillMapper.selectAllWithCreated()) {
            skills.add(support.lifeSkillOut(row));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("skills", skills);
        return out;
    }

    private Map<String, Object> knowledgeResult() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", knowledgeItems());
        return out;
    }

    private List<Map<String, Object>> knowledgeItems() {
        List<Map<String, Object>> items = new ArrayList<>();
        for (Map<String, Object> row : knowledgeMapper.selectRecent(300)) {
            items.add(support.lifeKnowledgeOut(row));
        }
        return items;
    }

    private Map<String, Object> eventsResult() {
        List<Map<String, Object>> events = new ArrayList<>();
        for (Map<String, Object> row : eventMapper.selectTopByDate(200)) {
            events.add(support.lifeEventOut(row));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("events", events);
        return out;
    }

    private List<Map<String, Object>> snapshotBriefs(List<Map<String, Object>> rows) {
        List<Map<String, Object>> briefs = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            briefs.add(support.lifeSnapshotBrief(row));
        }
        return briefs;
    }

    private List<Map<String, Object>> snapshotEnergyRows() {
        return energyMapper.selectRecent(60);
    }

    private List<Map<String, Object>> energyOut(List<Map<String, Object>> rows) {
        List<Map<String, Object>> logs = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            logs.add(support.lifeEnergyOut(row));
        }
        return logs;
    }

    private Map<String, Object> snapshotNodeRow(Map<?, ?> node, long now) {
        Map<String, Object> data = new LinkedHashMap<>();
        String nodeId = support.lifeText(node.get("id"), 64);
        data.put("id", nodeId.isEmpty() ? Ids.uuid() : nodeId);
        data.put("parent_id", support.lifeText(node.get("parentId"), 64));
        data.put("kind", pick(node.get("kind"), LifeSupport.LIFE_KINDS, "goal"));
        data.put("domain", pick(node.get("domain"), LifeSupport.LIFE_DOMAINS, "成长"));
        data.put("title", support.lifeText(node.get("title"), 200));
        data.put("detail", support.lifeText(node.get("detail"), 1200));
        data.put("risk", support.lifeText(node.get("risk"), 200));
        data.put("status", pick(node.get("status"), SNAPSHOT_NODE_STATUS, "todo"));
        data.put("horizon", support.lifeText(node.get("horizon"), 32));
        data.put("weight", support.lifeClampWeight(node.get("weight")));
        data.put("source", "ai");
        data.put("sort_order", LifeSupport.numOr(node.get("sortOrder"), 0));
        data.put("time_group", pick(node.get("timeGroup"), LifeSupport.LIFE_TIME_GROUPS, ""));
        data.put("deps", depsJson(node.get("deps")));
        data.put("step_no", LifeSupport.numOr(node.get("stepNo"), 0));
        data.put("priority", pick(node.get("priority"), LifeSupport.LIFE_TASK_PRIORITY, ""));
        data.put("series", support.lifeText(node.get("series"), 64));
        data.put("content_type", contentTypeOf(node.get("contentType")));
        data.put("content_body", contentBodyOf(node.get("contentBody")));
        data.put("created_at", LifeSupport.numOr(node.get("createdAt"), now));
        data.put("updated_at", now);
        return data;
    }

    /** 等价 {@code JSON.stringify([...new Set(deps.map(String))])}。 */
    private String depsJson(Object value) {
        List<String> result = new ArrayList<>();
        if (value instanceof List<?> list) {
            LinkedHashSet<String> unique = new LinkedHashSet<>();
            for (Object item : list) {
                unique.add(JsValues.toJsString(item));
            }
            result.addAll(unique);
        }
        return support.jsonStringify(result, null);
    }

    /** 等价 {@code LIFE_CONTENT_TYPES.includes(String(ct || '').toLowerCase()) ? String(ct).toLowerCase() : ''}。 */
    private static String contentTypeOf(Object value) {
        String lower = LifeSupport.str(value).toLowerCase();
        return LifeSupport.LIFE_CONTENT_TYPES.contains(lower) ? lower : "";
    }

    /** 等价 {@code node.contentBody ? (typeof string ? 原样 : JSON.stringify) : ''}。 */
    private String contentBodyOf(Object value) {
        if (!JsValues.truthy(value)) {
            return "";
        }
        if (value instanceof String text) {
            return text;
        }
        return support.jsonStringify(value, null);
    }

    /** 等价 {@code list.includes(value) ? value : fallback}（值必须与白名单元素严格相等）。 */
    private static String pick(Object value, List<String> allowed, String fallback) {
        if (value instanceof String text && allowed.contains(text)) {
            return text;
        }
        return fallback;
    }

    /** 等价 {@code Math.max(0, Number(value) || 0)}。 */
    private static double numMax0(Object value) {
        return Math.max(0d, LifeSupport.numOr(value, 0d));
    }

    private static Map<String, Object> body(Map<String, Object> raw) {
        return raw == null ? new LinkedHashMap<>() : raw;
    }
}
