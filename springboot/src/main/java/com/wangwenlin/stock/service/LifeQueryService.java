package com.wangwenlin.stock.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wangwenlin.stock.common.Ids;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.mapper.AiSettingsMapper;
import com.wangwenlin.stock.mapper.LifeCalendarEventMapper;
import com.wangwenlin.stock.mapper.LifeChangeLogMapper;
import com.wangwenlin.stock.mapper.LifeChatMessageMapper;
import com.wangwenlin.stock.mapper.LifeDailyTaskMapper;
import com.wangwenlin.stock.mapper.LifeEnergyLogMapper;
import com.wangwenlin.stock.mapper.LifeFuturePathMapper;
import com.wangwenlin.stock.mapper.LifeKnowledgeMapper;
import com.wangwenlin.stock.mapper.LifePersonaDerivedMapper;
import com.wangwenlin.stock.mapper.LifePersonaMapper;
import com.wangwenlin.stock.mapper.LifePlanNodeMapper;
import com.wangwenlin.stock.mapper.LifePlanSnapshotMapper;
import com.wangwenlin.stock.mapper.LifeRetrievalCacheMapper;
import com.wangwenlin.stock.mapper.LifeRetrievalLogMapper;
import com.wangwenlin.stock.mapper.LifeRetrievalQueueMapper;
import com.wangwenlin.stock.mapper.LifeSkillProfileMapper;
import com.wangwenlin.stock.support.LifeSupport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * 人生规划器（/api/life/**）数据库访问层 —— 与 server.js 的 life* DB 辅助函数逐行对齐。
 * 所有 SQL 不含 user_id（租户拦截器自动注入）；SELECT 返回 snake_case 键的 Map。
 */
@Service
public class LifeQueryService {

    private static final Logger log = LoggerFactory.getLogger(LifeQueryService.class);

    private final LifePlanNodeMapper nodeMapper;
    private final LifePlanSnapshotMapper snapshotMapper;
    private final LifeDailyTaskMapper taskMapper;
    private final LifeEnergyLogMapper energyMapper;
    private final LifeSkillProfileMapper skillMapper;
    private final LifeKnowledgeMapper knowledgeMapper;
    private final LifeCalendarEventMapper eventMapper;
    private final LifeChangeLogMapper changeLogMapper;
    private final LifeChatMessageMapper chatMapper;
    private final LifePersonaMapper personaMapper;
    private final LifePersonaDerivedMapper derivedMapper;
    private final LifeFuturePathMapper pathMapper;
    private final LifeRetrievalCacheMapper cacheMapper;
    private final LifeRetrievalLogMapper retrievalLogMapper;
    private final LifeRetrievalQueueMapper queueMapper;
    private final AiSettingsMapper settingsMapper;
    private final LifeSupport support;
    private final AiCallService aiCallService;
    private final ObjectMapper objectMapper;

    public LifeQueryService(LifePlanNodeMapper nodeMapper,
                            LifePlanSnapshotMapper snapshotMapper,
                            LifeDailyTaskMapper taskMapper,
                            LifeEnergyLogMapper energyMapper,
                            LifeSkillProfileMapper skillMapper,
                            LifeKnowledgeMapper knowledgeMapper,
                            LifeCalendarEventMapper eventMapper,
                            LifeChangeLogMapper changeLogMapper,
                            LifeChatMessageMapper chatMapper,
                            LifePersonaMapper personaMapper,
                            LifePersonaDerivedMapper derivedMapper,
                            LifeFuturePathMapper pathMapper,
                            LifeRetrievalCacheMapper cacheMapper,
                            LifeRetrievalLogMapper retrievalLogMapper,
                            LifeRetrievalQueueMapper queueMapper,
                            AiSettingsMapper settingsMapper,
                            LifeSupport support,
                            AiCallService aiCallService,
                            ObjectMapper objectMapper) {
        this.nodeMapper = nodeMapper;
        this.snapshotMapper = snapshotMapper;
        this.taskMapper = taskMapper;
        this.energyMapper = energyMapper;
        this.skillMapper = skillMapper;
        this.knowledgeMapper = knowledgeMapper;
        this.eventMapper = eventMapper;
        this.changeLogMapper = changeLogMapper;
        this.chatMapper = chatMapper;
        this.personaMapper = personaMapper;
        this.derivedMapper = derivedMapper;
        this.pathMapper = pathMapper;
        this.cacheMapper = cacheMapper;
        this.retrievalLogMapper = retrievalLogMapper;
        this.queueMapper = queueMapper;
        this.settingsMapper = settingsMapper;
        this.support = support;
        this.aiCallService = aiCallService;
        this.objectMapper = objectMapper;
    }

    // ==================================================================
    // 规划节点（6121-6163）
    // ==================================================================

    /** 等价 server.js 6121 的 listLifeNodes。 */
    public List<Map<String, Object>> listLifeNodes() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : nodeMapper.selectAll()) {
            out.add(support.lifeNodeOut(row));
        }
        return out;
    }

    /** 等价 server.js 6128 的 ensureLifeSelfNode，返回「大脑」节点 id。 */
    public String ensureLifeSelfNode() {
        Map<String, Object> first = nodeMapper.selectFirstSelf();
        if (first != null && JsValues.truthy(first.get("id"))) {
            String keep = str(first.get("id"));
            for (Map<String, Object> dupe : nodeMapper.listSelfIdsExcept(keep)) {
                nodeMapper.updateParentId(keep, str(dupe.get("id")));
                nodeMapper.deleteById(str(dupe.get("id")));
                log.info("[life-self] 发现重复的大脑节点 {}（子节点已改挂到 {}），已清理", dupe.get("id"), keep);
            }
            return keep;
        }
        String id = Ids.uuid();
        long now = System.currentTimeMillis();
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("id", id);
        node.put("parent_id", "");
        node.put("kind", "self");
        node.put("domain", "成长");
        node.put("title", "我的人生画像");
        node.put("detail", "方法：把所有赛道挂在它下面统一推进；验收：各条赛道闭环；资源：");
        node.put("status", "doing");
        node.put("horizon", "");
        node.put("weight", 100);
        node.put("content_type", "text");
        node.put("source", "ai");
        node.put("sort_order", 0);
        node.put("created_at", now);
        node.put("updated_at", now);
        nodeMapper.insertNode(node);
        return id;
    }

    /** 等价 server.js 6152 的 resolveLifeModel。 */
    public String resolveLifeModel() {
        Map<String, Object> values = new LinkedHashMap<>();
        for (Map<String, Object> row : settingsMapper.listAll()) {
            values.put(str(row.get("setting_key")), row.get("setting_value"));
        }
        String model = "";
        try {
            Object parsed = objectMapper.readValue(orEmpty(values.get("ai_model_routes"), "{}"), Object.class);
            if (parsed instanceof Map<?, ?> routes) {
                model = firstTruthy(routes.get("life"), routes.get("assistant"));
            }
        } catch (Exception ignored) {
            // 路由配置异常时退回默认模型
        }
        if (!model.isEmpty()) {
            return model;
        }
        String fallback = orEmpty(values.get("default_model"), "");
        return fallback.isEmpty() ? "agnes-2.5-flash" : fallback;
    }

    /** 等价 server.js 6192 的 lifePersonaContext。 */
    public String lifePersonaContext() {
        try {
            Map<String, Object> personaRow = readLifePersonaRow();
            List<Map<String, Object>> paths = new ArrayList<>();
            for (Map<String, Object> row : pathMapper.selectTop40()) {
                paths.add(support.lifePathOut(row));
            }
            return String.join("\n",
                    "【当前全局人物画像】",
                    support.jsonStringify(support.lifePersonaOut(personaRow), null),
                    "",
                    "【当前未来发展路径库】",
                    support.jsonStringify(paths, null));
        } catch (Exception error) {
            return "【当前全局人物画像】（暂无）\n\n【当前未来发展路径库】（暂无）";
        }
    }

    // ==================================================================
    // 动态人物画像（6295-6406）
    // ==================================================================

    /** 等价 server.js 6299 的 readLifeDerivedRow。 */
    public Map<String, Object> readLifeDerivedRow() {
        return derivedMapper.selectLatest();
    }

    /** 等价 server.js 6338 的 deriveLifePersona。画像重算失败时返回上一版（宁可旧也不能空）。 */
    public Map<String, Object> deriveLifePersona(String reason) {
        List<Map<String, Object>> nodes = listLifeNodes();
        List<Map<String, Object>> tasks = listLifeTasks();
        Map<String, Object> stats = support.computePersonaStats(nodes, tasks);
        if (!JsValues.truthy(stats.get("nodeTotal")) && !JsValues.truthy(stats.get("taskTotal"))) {
            return null;
        }
        String signature = support.lifePersonaSignature(stats);
        Map<String, Object> row = readLifeDerivedRow();
        if (row != null && str(row.get("signature")).equals(signature)) {
            Map<String, Object> cached = support.lifeDerivedOut(row);
            cached.put("changed", false);
            return cached;
        }
        String facts = support.slice(support.jsonStringify(stats, 1), 12000);
        String model = resolveLifeModel();
        String raw = "";
        try {
            raw = aiCallService.callAI(
                    LifeSupport.LIFE_PERSONA_DERIVE_SYSTEM,
                    "【今天】" + support.lifeTodayText() + "\n【规划完成度事实清单】\n" + facts + "\n\n请据此输出画像 JSON。",
                    null, model, 120000, 4096);
        } catch (Exception error) {
            log.warn("[life-persona] 动态画像推理失败：{}", error.getMessage());
            raw = "";
        }
        Object parsed = support.parseLifeJson(raw);
        if (!(parsed instanceof Map) && !(parsed instanceof List)) {
            Map<String, Object> fallback = support.lifeDerivedOut(row);
            fallback.put("changed", false);
            return fallback;
        }
        long now = System.currentTimeMillis();
        List<String> values = personaDerivedValues(parsed);
        String progressJson = support.slice(support.jsonStringify(stats, null), 60000);
        if (row != null) {
            derivedMapper.updateDerived(str(row.get("id")),
                    values.get(0), values.get(1), values.get(2), values.get(3),
                    values.get(4), values.get(5), values.get(6), progressJson, signature, now);
        } else {
            derivedMapper.insertDerived(Ids.uuid(),
                    values.get(0), values.get(1), values.get(2), values.get(3),
                    values.get(4), values.get(5), values.get(6), progressJson, signature, now);
        }
        log.info("[life-persona] 动态画像已重算（{}）：完成度 {}%（节点 {}/{}，任务 {}/{}）",
                reason == null || reason.isEmpty() ? "手动" : reason,
                stats.get("completionRate"), stats.get("nodeDone"), stats.get("nodeTotal"),
                stats.get("taskDone"), stats.get("taskTotal"));
        Map<String, Object> out = support.lifeDerivedOut(readLifeDerivedRow());
        out.put("changed", true);
        return out;
    }

    /** 等价 deriveLifePersona 里的七维取值（每维 2~4 条短句，按 \n 拼接）。 */
    private List<String> personaDerivedValues(Object parsed) {
        Map<?, ?> source = parsed instanceof Map<?, ?> map ? map : Map.of();
        List<String> values = new ArrayList<>();
        for (Map<String, Object> dim : LifeSupport.LIFE_PERSONA_DERIVED_DIMS) {
            Object rawLines = source.get(str(dim.get("key")));
            List<String> lines = new ArrayList<>();
            if (rawLines instanceof List<?> list) {
                for (Object line : list) {
                    String text = support.lifeText(line, 120);
                    if (!text.isEmpty()) {
                        lines.add(text);
                    }
                }
            }
            values.add(String.join("\n", lines));
        }
        return values;
    }

    /** 等价 server.js 6388 的 enforceStoredExamAnchors，返回被前移的节点数。 */
    public int enforceStoredExamAnchors() {
        List<Map<String, Object>> rows = nodeMapper.listHorizonNonEmpty();
        LinkedHashSet<String> examDays = new LinkedHashSet<>();
        for (Map<String, Object> row : rows) {
            String horizon = str(row.get("horizon"));
            if (LifeSupport.LIFE_DATE_RE.matcher(horizon).matches()
                    && LifeSupport.LIFE_EXAM_DAY_RE.matcher(orEmpty(row.get("title"))).find()) {
                examDays.add(horizon);
            }
        }
        if (examDays.isEmpty()) {
            return 0;
        }
        int changed = 0;
        for (Map<String, Object> row : rows) {
            String day = str(row.get("horizon"));
            if (!examDays.contains(day)) {
                continue;
            }
            String title = orEmpty(row.get("title"));
            if (LifeSupport.LIFE_EXAM_DAY_RE.matcher(title).find()) {
                continue;
            }
            if (!LifeSupport.LIFE_PREP_RE.matcher(title).find()) {
                continue;
            }
            String shifted = support.lifeDateShift(day, -1);
            nodeMapper.updateHorizonTimeGroup(shifted, "urgent", System.currentTimeMillis(), str(row.get("id")));
            log.info("[life-anchor] 增量路径前移截止日期：「{}」{} → {}", title, day, shifted);
            changed += 1;
        }
        return changed;
    }

    // ==================================================================
    // 时间骨架收口（6433-6516）
    // ==================================================================

    /** 等价 server.js 6433 的 fillLifeContainerDates，返回被补日期的节点数。 */
    public int fillLifeContainerDates() {
        List<Map<String, Object>> rows = nodeMapper.listNodeDateFields();
        if (rows.isEmpty()) {
            return 0;
        }
        Map<String, Map<String, Object>> byId = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            byId.put(str(row.get("id")), row);
        }
        int changed = 0;

        // ① 清掉非法的模糊刻度（远期结局推演节点允许保留「1年内」这类刻度，不动它们）
        for (Map<String, Object> row : rows) {
            String raw = support.trim(row.get("horizon"));
            if (raw.isEmpty() || isDate(raw) || isOutcome(row)) {
                continue;
            }
            if (!LifeSupport.LIFE_SCALE_WORD_RE.matcher(raw).matches()) {
                continue;
            }
            row.put("horizon", "");
            nodeMapper.updateHorizon("", System.currentTimeMillis(), str(row.get("id")));
            changed += 1;
        }

        Map<String, List<Map<String, Object>>> children = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String pid = orEmpty(row.get("parent_id"));
            if (pid.isEmpty() || !byId.containsKey(pid) || isOutcome(row)) {
                continue;
            }
            children.computeIfAbsent(pid, key -> new ArrayList<>()).add(row);
        }

        // ② 递归求子树日期范围（记忆化，depth 上限兜住环形父子关系）
        Map<String, String[]> rangeCache = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            rangeOf(row, 0, children, rangeCache);
        }

        // ③ 补日期：截止日期取子树最晚日，开始日期取子树最早日
        for (Map<String, Object> row : rows) {
            if ("self".equals(str(row.get("kind"))) || isOutcome(row)) {
                continue;
            }
            String[] range = rangeOf(row, 0, children, rangeCache);
            String min = range[0];
            String max = range[1];
            if (max.isEmpty()) {
                continue;
            }
            boolean isTrack = "domain".equals(str(row.get("kind")));
            boolean wantStart = !min.isEmpty() && min.compareTo(max) < 0;
            boolean setHorizon = isTrack || !isDate(row.get("horizon"));
            boolean setStart = wantStart && (isTrack || !isDate(row.get("start_date")));
            if (!setHorizon && !setStart) {
                continue;
            }
            nodeMapper.updateNodeDates(str(row.get("id")), setHorizon, max, setStart, min,
                    support.lifeTimeGroupOf(max), System.currentTimeMillis());
            // 同步到内存快照，方便下面的叶子继承拿到父节点刚补好的日期
            if (setHorizon) {
                row.put("horizon", max);
            }
            if (setStart) {
                row.put("start_date", min);
            }
            changed += 1;
        }

        // ④ 叶子任务没有任何日期时继承父节点的截止日
        for (Map<String, Object> row : rows) {
            if ("self".equals(str(row.get("kind"))) || isOutcome(row)) {
                continue;
            }
            if (!support.trim(row.get("horizon")).isEmpty()) {
                continue;
            }
            if (isDate(row.get("start_date"))) {
                continue;
            }
            if (!children.getOrDefault(str(row.get("id")), new ArrayList<>()).isEmpty()) {
                continue;
            }
            Map<String, Object> parent = byId.get(orEmpty(row.get("parent_id")));
            if (parent == null || !isDate(parent.get("horizon"))) {
                continue;
            }
            String day = support.slice(str(parent.get("horizon")), 10);
            nodeMapper.updateHorizonTimeGroup(day, support.lifeTimeGroupOf(day),
                    System.currentTimeMillis(), str(row.get("id")));
            changed += 1;
        }
        return changed;
    }

    private String[] rangeOf(Map<String, Object> row, int depth,
                             Map<String, List<Map<String, Object>>> children,
                             Map<String, String[]> rangeCache) {
        String key = str(row.get("id"));
        String[] cached = rangeCache.get(key);
        if (cached != null) {
            return cached;
        }
        String[] range = {"", ""};
        take(range, row.get("horizon"));
        take(range, row.get("start_date"));
        take(range, support.lifeDateFromText(row.get("title")));
        if (depth < 20) {
            for (Map<String, Object> child : children.getOrDefault(key, new ArrayList<>())) {
                String[] inner = rangeOf(child, depth + 1, children, rangeCache);
                take(range, inner[0]);
                take(range, inner[1]);
            }
        }
        rangeCache.put(key, range);
        return range;
    }

    private void take(String[] range, Object value) {
        if (!isDate(value)) {
            return;
        }
        String day = support.slice(str(value), 10);
        if (range[0].isEmpty() || day.compareTo(range[0]) < 0) {
            range[0] = day;
        }
        if (range[1].isEmpty() || day.compareTo(range[1]) > 0) {
            range[1] = day;
        }
    }

    private boolean isDate(Object value) {
        return LifeSupport.LIFE_DATE_RE.matcher(orEmpty(value)).matches();
    }

    private boolean isOutcome(Map<String, Object> row) {
        return "milestone".equals(str(row.get("kind")))
                && LifeSupport.LIFE_OUTCOME_RE.matcher(orEmpty(row.get("title"))).find();
    }

    // ==================================================================
    // 每日任务 / 统计 / 提醒（9317-9370）
    // ==================================================================

    /** 等价 server.js 9317 的 listLifeTasks（无过滤）。 */
    public List<Map<String, Object>> listLifeTasks() {
        return listLifeTasks(Map.of());
    }

    /** 等价 server.js 9317 的 listLifeTasks，range 键：date / from / to。 */
    public List<Map<String, Object>> listLifeTasks(Map<String, Object> range) {
        Map<String, Object> r = range == null ? Map.of() : range;
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : taskMapper.selectTasks(
                orEmpty(r.get("date"), ""), orEmpty(r.get("from"), ""), orEmpty(r.get("to"), ""))) {
            out.add(support.lifeTaskOut(row));
        }
        return out;
    }

    /** 等价 server.js 9329 的 lifePlannedMinutes：某日待执行任务的预估总时长。 */
    public int lifePlannedMinutes(String date) {
        int total = 0;
        for (Map<String, Object> task : listLifeTasks(Map.of("date", date == null ? "" : date))) {
            String status = str(task.get("status"));
            if ("done".equals(status) || "drop".equals(status)) {
                continue;
            }
            total += (int) support.numOr(task.get("estMinutes"), 0);
        }
        return total;
    }

    /** 等价 server.js 9335 的 lifeProgressStats。 */
    public Map<String, Object> lifeProgressStats() {
        List<Map<String, Object>> tasks = listLifeTasks();
        Map<String, Object> counts = new LinkedHashMap<>();
        counts.put("todo", 0);
        counts.put("doing", 0);
        counts.put("done", 0);
        counts.put("delay", 0);
        counts.put("drop", 0);
        for (Map<String, Object> task : tasks) {
            String status = str(task.get("status"));
            Object current = counts.get(status);
            counts.put(status, (int) support.numOr(current, 0) + 1);
        }
        int total = tasks.size();
        int drop = (int) support.numOr(counts.get("drop"), 0);
        int active = total - drop;
        int progress = active > 0
                ? (int) Math.round(((int) support.numOr(counts.get("done"), 0) / (double) active) * 100) : 0;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", total);
        out.put("active", active);
        out.put("progress", progress);
        out.put("counts", counts);
        return out;
    }

    /** 等价 server.js 9345 的 lifeAlerts。 */
    public List<Map<String, Object>> lifeAlerts() {
        List<Map<String, Object>> alerts = new ArrayList<>();
        String today = support.todayStr();

        for (Map<String, Object> task : listLifeTasks(Map.of("to", support.lifeDateShift(today, 3)))) {
            String status = str(task.get("status"));
            if ("done".equals(status) || "drop".equals(status)) {
                continue;
            }
            if (!"P0".equals(str(task.get("priority")))) {
                continue;
            }
            Integer days = support.lifeDaysUntil(task.get("date"));
            Map<String, Object> alert = new LinkedHashMap<>();
            alert.put("kind", "task");
            alert.put("level", "high");
            alert.put("title", task.get("title"));
            alert.put("date", task.get("date"));
            alert.put("daysLeft", days);
            alert.put("note", "P0 任务" + (days != null && days >= 0 ? days + " 天内到期" : "已逾期"));
            alerts.add(alert);
        }

        for (Map<String, Object> node : listLifeNodes()) {
            String status = str(node.get("status"));
            String risk = str(node.get("risk"));
            if ("done".equals(status) || risk.isEmpty()) {
                continue;
            }
            if (!LifeSupport.LIFE_HIGH_RISK_RE.matcher(risk).find()) {
                continue;
            }
            Map<String, Object> alert = new LinkedHashMap<>();
            alert.put("kind", "risk");
            alert.put("level", "high");
            alert.put("title", node.get("title"));
            alert.put("date", orEmpty(node.get("horizon"), ""));
            alert.put("daysLeft", null);
            alert.put("note", "高风险：" + risk);
            alerts.add(alert);
        }

        for (Map<String, Object> row : eventMapper.selectAllByDate()) {
            Map<String, Object> event = support.lifeEventOut(row);
            if ("done".equals(str(event.get("status")))) {
                continue;
            }
            List<Double> marks = new ArrayList<>();
            for (String part : str(event.get("remindDays")).split(",", -1)) {
                Double mark = LifeSupport.jsNumber(part.trim());
                if (mark != null && Double.isFinite(mark)) {
                    marks.add(mark);
                }
            }
            Object daysLeftRaw = event.get("daysLeft");
            Double daysLeft = JsValues.parse(daysLeftRaw);
            if (daysLeft == null || daysLeft < 0) {
                continue;
            }
            if (!marks.contains(daysLeft)) {
                continue;
            }
            Map<String, Object> alert = new LinkedHashMap<>();
            alert.put("kind", "event");
            alert.put("level", "high".equals(str(event.get("level"))) ? "high" : "mid");
            alert.put("title", event.get("title"));
            alert.put("date", event.get("date"));
            alert.put("daysLeft", daysLeftRaw);
            alert.put("note", "外部事件距今 " + JsValues.toJsString(daysLeftRaw) + " 天");
            alerts.add(alert);
        }
        return alerts;
    }

    // ==================================================================
    // 结构化上下文（8264-8288）
    // ==================================================================

    /** 等价 server.js 8264 的 lifeStructuredContext：把面板执行数据回灌给 AI。 */
    public String lifeStructuredContext() {
        String today = support.todayStr();
        List<Map<String, Object>> tasks = listLifeTasks(Map.of(
                "from", support.lifeDateShift(today, -7),
                "to", support.lifeDateShift(today, 7)));

        Map<String, Object> snapshotRow = snapshotMapper.selectLatest();
        Map<String, Object> energyRow = energyMapper.selectLatest();
        Map<String, Object> snapshot = snapshotRow == null ? null : support.lifeSnapshotOut(snapshotRow);
        Map<String, Object> energy = energyRow == null ? null : support.lifeEnergyOut(energyRow);

        List<Map<String, Object>> skills = new ArrayList<>();
        for (Map<String, Object> row : skillMapper.selectAll()) {
            skills.add(support.lifeSkillOut(row));
        }
        List<Map<String, Object>> events = new ArrayList<>();
        for (Map<String, Object> row : eventMapper.selectTopByDate(20)) {
            events.add(support.lifeEventOut(row));
        }
        List<Map<String, Object>> due = new ArrayList<>();
        for (Map<String, Object> row : knowledgeMapper.selectRecent(60)) {
            Map<String, Object> item = support.lifeKnowledgeOut(row);
            String next = str(item.get("nextReviewDate"));
            if (!next.isEmpty() && next.compareTo(today) <= 0) {
                due.add(item);
            }
        }
        Map<String, Object> stats = lifeProgressStats();
        Map<String, Object> counts = stats.get("counts") instanceof Map<?, ?> map ? castMap(map) : Map.of();

        List<String> lines = new ArrayList<>();
        lines.add("【结构化执行数据（来自前端面板，与下面任务表必须一致，不要编造冲突内容）】");
        lines.add("任务进度：共 " + stats.get("total") + " 项，已完成 " + counts.get("done")
                + "，进行中 " + counts.get("doing") + "，未开始 " + counts.get("todo")
                + "，延期 " + counts.get("delay") + "，放弃 " + counts.get("drop")
                + "，完成率 " + stats.get("progress") + "%");
        lines.add(snapshot != null
                ? "最近快照：" + snapshot.get("date") + " 完成率 " + snapshot.get("progress") + "%｜" + orEmpty(snapshot.get("diffNote"))
                : "最近快照：暂无");
        lines.add("每日任务（前后 7 天）：" + (tasks.isEmpty() ? "（暂无，需在每日细分任务表中补齐）" : taskLines(tasks)));
        lines.add(energy != null
                ? "最近精力负荷：" + energy.get("date") + " 计划 " + energy.get("plannedMinutes")
                        + " 分钟 / 上限 " + energy.get("capacityMinutes") + " 分钟"
                        + (JsValues.truthy(energy.get("overload")) ? "（超负荷，必须删减次要任务）" : "")
                : "最近精力负荷：暂无");
        lines.add("技能档案：" + (skills.isEmpty() ? "（暂无，需在个人技能档案表中补齐）" : skillLines(skills)));
        lines.add("外部事件：" + (events.isEmpty() ? "（暂无，需在外部事件日历中补齐）" : eventLines(events)));
        lines.add("待复习知识点：" + (due.isEmpty() ? "（暂无到期的复习任务）" : knowledgeLines(due)));
        return String.join("\n", lines);
    }

    private static String taskLines(List<Map<String, Object>> tasks) {
        List<String> parts = new ArrayList<>();
        for (Map<String, Object> task : tasks) {
            parts.add(str(task.get("date")) + " " + str(task.get("priority")) + " " + str(task.get("title"))
                    + "（" + str(task.get("status"))
                    + (JsValues.truthy(task.get("estMinutes")) ? "，" + task.get("estMinutes") + " 分钟" : "")
                    + (JsValues.truthy(task.get("preTask")) ? "，前置：" + task.get("preTask") : "")
                    + "）");
        }
        return String.join("；", parts);
    }

    private static String skillLines(List<Map<String, Object>> skills) {
        List<String> parts = new ArrayList<>();
        for (Map<String, Object> skill : skills) {
            String category = str(skill.get("category"));
            String label = "own".equals(category) ? "已掌握" : ("learn".equals(category) ? "待学习" : "短板");
            parts.add(label + "·" + str(skill.get("name"))
                    + (JsValues.truthy(skill.get("level")) ? "（" + skill.get("level") + "）" : ""));
        }
        return String.join("；", parts);
    }

    private static String eventLines(List<Map<String, Object>> events) {
        List<String> parts = new ArrayList<>();
        for (Map<String, Object> event : events) {
            Object daysLeft = event.get("daysLeft");
            parts.add(str(event.get("date")) + " " + str(event.get("title"))
                    + (daysLeft != null ? "（距今 " + JsValues.toJsString(daysLeft) + " 天）" : ""));
        }
        return String.join("；", parts);
    }

    private static String knowledgeLines(List<Map<String, Object>> due) {
        List<String> parts = new ArrayList<>();
        for (Map<String, Object> item : due) {
            parts.add(str(item.get("topic")) + "（" + str(item.get("subject"))
                    + "，复习阶段 " + JsValues.toJsString(item.get("reviewStage")) + "）");
        }
        return String.join("；", parts);
    }

    // ==================================================================
    // 面板变更 / 增量联动（9153-9214）
    // ==================================================================

    /** 等价 server.js 9153 的 logLifePanelChange：变更日志 + 对话流系统消息。 */
    public void logLifePanelChange(String moduleName, String content, String reason, Object affectedModules) {
        long now = System.currentTimeMillis();
        Map<String, Object> pure = support.logLifePanelChange(moduleName, content, reason, affectedModules, now);
        changeLogMapper.insertChange(str(pure.get("id")), str(pure.get("module")), str(pure.get("content")),
                str(pure.get("reason")), str(pure.get("affected")), str(pure.get("snapshotId")), now);
        chatMapper.insertMessage(Ids.uuid(), "system", str(pure.get("messageContent")), now);
    }

    /** 等价 server.js 9164 的 refreshLifeDerived：只重算被牵连的模块并记变更日志。 */
    public void refreshLifeDerived(String trigger, Object changedModules, String reason, String changeContent) {
        String today = support.todayStr();
        List<Object> modules = changedModules instanceof List<?> raw ? new ArrayList<>(raw) : new ArrayList<>();
        Map<String, Object> stats = lifeProgressStats();
        long now = System.currentTimeMillis();

        // 1) 当日进度快照：同一天只保留一条，存在即覆盖；写失败绝不能连带整轮同步失败
        if (modules.contains("进度快照")) {
            try {
                Map<String, Object> snap = snapshotMapper.selectByDate(today);
                String prevNote = snap != null
                        ? "对比上次快照：完成率 " + (int) support.numOr(snap.get("progress"), 0) + "% → " + stats.get("progress") + "%"
                        : "当日首次快照";
                String diffNote = prevNote + "，延期 " + countsOf(stats).get("delay")
                        + "，共 " + stats.get("total") + " 项任务";
                String payload = snapshotPayload(stats);
                if (snap != null) {
                    snapshotMapper.updateSnapshot(str(snap.get("id")), (int) support.numOr(stats.get("progress"), 0),
                            payload, support.lifeText(diffNote, 500));
                } else {
                    snapshotMapper.insertSnapshot(Ids.uuid(), today, (int) support.numOr(stats.get("progress"), 0),
                            payload, support.lifeText(diffNote, 500), now);
                }
            } catch (Exception error) {
                log.warn("[life snapshot] 存档失败，已跳过（不影响规划同步）：{}", error.getMessage());
            }
        }

        // 2) 当日精力负荷：只更新计划总时长，保留用户填写的上限、干扰与身体状态
        if (modules.contains("精力负荷")) {
            int planned = lifePlannedMinutes(today);
            Map<String, Object> energy = energyMapper.selectByDate(today);
            if (energy != null) {
                int capacity = (int) support.numOr(energy.get("capacity_minutes"), 0);
                int overload = (planned > capacity && capacity > 0) ? 1 : 0;
                energyMapper.updatePlanned(str(energy.get("id")), planned, overload);
            } else {
                energyMapper.insertEnergy(Ids.uuid(), today, planned, 0, 0, "", 0, "", "由任务变更自动汇总", now);
            }
        }

        // 3) 变更日志 + 系统消息（把受影响模块写进内容，供 AI 与变更日志面板展示）
        String triggerText = support.lifeText(trigger, 32);
        String body = (changeContent == null || changeContent.isEmpty())
                ? triggerText + "发生变更，已联动刷新：" + (modules.isEmpty() ? "无" : joinModules(modules))
                : changeContent;
        logLifePanelChange(triggerText, body,
                (reason == null || reason.isEmpty()) ? "自动增量联动" : reason, modules);
    }

    private static Map<String, Object> countsOf(Map<String, Object> stats) {
        return stats.get("counts") instanceof Map<?, ?> map ? castMap(map) : Map.of();
    }

    private String snapshotPayload(Map<String, Object> stats) {
        Map<String, Object> payload = new LinkedHashMap<>(stats);
        payload.put("nodes", listLifeNodes());
        payload.put("tasks", listLifeTasks());
        return support.jsonStringify(payload, null);
    }

    private static String joinModules(List<Object> modules) {
        List<String> parts = new ArrayList<>();
        for (Object module : modules) {
            parts.add(JsValues.toJsString(module));
        }
        return String.join("、", parts);
    }

    // ==================================================================
    // 检索缓存 / 队列（7607-7653）
    // ==================================================================

    /** 等价 server.js 7612 的 lifeCacheLookup：命中返回结果串，未命中返回 null。 */
    public String lifeCacheLookup(String query) {
        String key = support.lifeQueryKey(query);
        Map<String, Object> row = cacheMapper.selectResult(key);
        if (row == null) {
            return null;
        }
        cacheMapper.bumpHit(key, System.currentTimeMillis());
        return orEmpty(row.get("result"), "");
    }

    /** 等价 server.js 7620 的 lifeCacheStore。 */
    public void lifeCacheStore(String query, Object result) {
        String key = support.lifeQueryKey(query);
        long now = System.currentTimeMillis();
        cacheMapper.upsert(key, support.lifeText(query, 400), str(result), now, now);
    }

    /** 等价 server.js 7629 的 logLifeRetrieval。 */
    public void logLifeRetrieval(String batchId, Object action, Object detail, Object cost) {
        retrievalLogMapper.insertLog(Ids.uuid(), batchId == null ? "" : batchId,
                support.lifeText(action, 24), support.lifeText(detail, 400),
                support.numOr(cost, 0), System.currentTimeMillis());
    }

    /** 等价 server.js 7637 的 queueLifeRetrieval，返回队列 id（无 query 时返回空串）。 */
    public String queueLifeRetrieval(Map<String, Object> item) {
        Map<String, Object> source = item == null ? Map.of() : item;
        String query = support.lifeText(source.get("query"), 400);
        if (query.isEmpty()) {
            return "";
        }
        String cached = lifeCacheLookup(query);
        boolean hit = cached != null && !cached.isEmpty();
        long now = System.currentTimeMillis();
        String id = Ids.uuid();
        String priority = str(source.get("priority"));
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", id);
        row.put("batch_id", "");
        row.put("node_id", support.lifeText(source.get("nodeId"), 64));
        row.put("series", support.lifeText(source.get("series"), 64));
        row.put("title", support.lifeText(source.get("title"), 200));
        row.put("query", query);
        row.put("priority", LifeSupport.LIFE_TASK_PRIORITY.contains(priority) ? priority : "P2");
        row.put("est_cost", hit ? 0d : LifeSupport.LIFE_RETRIEVAL_EST_COST);
        row.put("status", hit ? "done" : "pending");
        row.put("result", hit ? cached : null);
        row.put("from_cache", hit ? 1 : 0);
        row.put("created_at", now);
        row.put("decided_at", hit ? now : 0L);
        row.put("updated_at", now);
        queueMapper.insertQueue(row);
        return id;
    }

    // ==================================================================
    // 静态画像 / 路径库（9898 / 9979）
    // ==================================================================

    /** 等价 server.js 9898 的 readLifePersonaRow：最近一条静态画像行（无则 null）。 */
    public Map<String, Object> readLifePersonaRow() {
        return personaMapper.selectLatest();
    }

    /** 等价 server.js 9979 的 listLifePaths。 */
    public List<Map<String, Object>> listLifePaths() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : pathMapper.selectAll()) {
            out.add(support.lifePathOut(row));
        }
        return out;
    }

    // ==================================================================
    // 内部工具
    // ==================================================================

    private static String str(Object value) {
        return value == null ? "" : JsValues.toJsString(value);
    }

    /** 等价 {@code value || fallback}（字符串）。 */
    private static String orEmpty(Object value, String fallback) {
        return JsValues.truthy(value) ? JsValues.toJsString(value) : fallback;
    }

    private String orEmpty(Object value) {
        return support.orEmpty(value);
    }

    private static String firstTruthy(Object primary, Object secondary) {
        if (JsValues.truthy(primary)) {
            return JsValues.toJsString(primary);
        }
        return JsValues.truthy(secondary) ? JsValues.toJsString(secondary) : "";
    }

    private static Map<String, Object> castMap(Map<?, ?> map) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            out.put(String.valueOf(entry.getKey()), entry.getValue());
        }
        return out;
    }
}
