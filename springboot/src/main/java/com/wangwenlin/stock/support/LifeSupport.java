package com.wangwenlin.stock.support;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wangwenlin.stock.common.Ids;
import com.wangwenlin.stock.common.JsStrings;
import com.wangwenlin.stock.common.JsValues;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 人生规划器（/api/life/**）共享辅助层 —— 与 server.js 的 life* 纯辅助函数逐行对齐。
 * 只放常量与纯函数（可含 JSON 解析）；所有数据库访问在 LifeQueryService。
 */
@Component
public class LifeSupport {

    // ==================================================================
    // 常量（对齐 server.js 5987-5990 / 6044 / 6519 / 9098-9120 / 7604 / 6213-6221 / 9883-9890）
    // ==================================================================

    public static final List<String> LIFE_DOMAINS = List.of("学业", "职业", "财务", "健康", "家庭", "成长");
    public static final List<String> LIFE_KINDS = List.of("self", "domain", "goal", "action", "milestone");
    public static final List<String> LIFE_TIME_GROUPS = List.of("urgent", "mid", "future");
    public static final List<String> LIFE_CONTENT_TYPES =
            List.of("text", "table", "link", "checklist", "progress", "branch", "calc", "doc");
    public static final List<String> LIFE_WEEKDAYS = List.of("周日", "周一", "周二", "周三", "周四", "周五", "周六");
    public static final List<String> LIFE_TASK_STATUS = List.of("todo", "doing", "done", "delay", "drop");
    public static final List<String> LIFE_TASK_PRIORITY = List.of("P0", "P1", "P2", "P3");
    public static final List<String> LIFE_REPEAT_TYPES = List.of("daily", "weekday", "weekly", "once");
    public static final List<String> LIFE_SKILL_CATEGORY =
            List.of("info", "own", "learn", "cert", "hobby", "weak", "pref");
    public static final List<Integer> LIFE_REVIEW_OFFSETS = List.of(0, 2, 4, 7, 14, -1);
    public static final double LIFE_RETRIEVAL_EST_COST = 0.02d;
    public static final List<String> LIFE_RETRIEVAL_STATUS =
            List.of("pending", "approved", "rejected", "done", "failed");

    /** 动态人物画像七维（顺序即 SQL 列顺序，不可调整）。 */
    public static final List<Map<String, Object>> LIFE_PERSONA_DERIVED_DIMS = personaDerivedDims();

    /** 静态人物画像六维。 */
    public static final List<Map<String, Object>> LIFE_PERSONA_DIMS = personaDims();

    // ==================================================================
    // 正则（对齐 JS 字面量，逐字符等价）
    // ==================================================================

    public static final Pattern LIFE_DATE_RE = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");
    /**
     * lifeUrlsIn 的网址匹配：{@code /https?:\/\/[^\s；;，,、）)【】"'<>]+/g}。
     */
    public static final Pattern LIFE_URL_RE = Pattern.compile("https?://[^\\s；;，,、）)【】\"'<>]+");
    /** lifeTitleKey 的标点清洗字符集。 */
    private static final Pattern LIFE_TITLE_PUNCT = Pattern.compile("[，。、；：\"'（）()【】\\[\\]…·,.;:!?~\\-_/\\\\|]");
    /** parseLifeJson 的 {@code /\{[\s\S]*\}/}。 */
    private static final Pattern LIFE_JSON_BLOCK = Pattern.compile("\\{[\\s\\S]*\\}");
    /** normalizeLifeTimeGroups.parseDate：{@code /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/}。 */
    private static final Pattern LIFE_NUMERIC_DATE_RE = Pattern.compile("(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})");
    /** lifeDateFromText：{@code /(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/}。 */
    private static final Pattern LIFE_CN_DATE_RE = Pattern.compile("(20\\d{2})\\s*年\\s*(\\d{1,2})\\s*月\\s*(\\d{1,2})\\s*日");
    /** lifeDerivedAnchors：{@code /\d{4}\s*年|\d{1,2}\s*月|\d{1,2}\s*日/g}。 */
    private static final Pattern LIFE_CN_DATE_STRIP_RE = Pattern.compile("\\d{4}\\s*年|\\d{1,2}\\s*月|\\d{1,2}\\s*日");

    private static final Pattern LIFE_CT_TABLE_RE = Pattern.compile("对比表|汇总表|任务表|清单表|时间节点表");
    private static final Pattern LIFE_CT_PROGRESS_RE = Pattern.compile("完成率|进度|快照");
    private static final Pattern LIFE_CT_CALC_RE = Pattern.compile("正确率|测算|仓位|资金|时长统计|得分");
    private static final Pattern LIFE_CT_DOC_RE = Pattern.compile("简历|模板|范文|论文|自我介绍");
    private static final Pattern LIFE_CT_LINK_RE = Pattern.compile("官网|报名网址|题库链接|视频教程|资料链接");

    public static final Pattern LIFE_SCALE_WORD_RE = Pattern.compile(
            "^(short|mid|long|urgent|future|近期|中期|远期|长期|短期|近期内|中期内|远期内|即时|立刻|马上|尽快|待定|待安排|tbd|now|asap)$",
            Pattern.CASE_INSENSITIVE);
    public static final Pattern LIFE_OUTCOME_RE = Pattern.compile("(上岸|失利|失败|兜底|成功人生|人生状态|结局)");
    public static final Pattern LIFE_EXAM_DAY_RE = Pattern.compile("考试|笔试|开考|面试|机考|考场|准考证");
    public static final Pattern LIFE_PREP_RE = Pattern.compile("模拟|模考|冲刺|刷题|真题|复习|复盘|背诵|练习|押题|串讲");

    private static final Pattern LIFE_ZHUNKAO_RE = Pattern.compile("准考证");
    private static final Pattern LIFE_EXAM_TITLE_RE = Pattern.compile("考试|准考证|报名|笔试|面试");
    private static final Pattern LIFE_RESOURCE_TITLE_RE = Pattern.compile("资料|模板|方法|入口|网站|课程|书|题库|平台|官网");
    public static final Pattern LIFE_HIGH_RISK_RE = Pattern.compile("高");
    private static final Pattern LIFE_DERIVE_SERIES_RE = Pattern.compile("推演|总览|全局");
    private static final Pattern LIFE_PRIORITY_PREFIX_RE = Pattern.compile("^P");

    private static final Pattern LIFE_REPEAT_WEEKDAY_RE = Pattern.compile("工作日|周一至周五|周一~周五|周一到周五");
    private static final Pattern LIFE_REPEAT_DAILY_RE = Pattern.compile("每天|每日|天天|日常");
    private static final Pattern LIFE_REPEAT_WEEKLY_RE = Pattern.compile("每周|周[一二三四五六日天]|一周一次|每周一次");
    private static final Pattern LIFE_REPEAT_HABIT_RE =
            Pattern.compile("刷题|刷\\d+|背单词|背诵|精读|每日一练|错题|复盘|模拟考|真题|单词|打卡|练字|听力|阅读理解");

    private static final Pattern LIFE_PLACEHOLDER_LABEL_RE =
            Pattern.compile("([^；;｜|\\n「『]{0,40})[｜|]\\s*搜索关键词");
    private static final Pattern LIFE_PLACEHOLDER_KW_RE =
            Pattern.compile("搜索关键词[：:]?\\s*[「『][^」』]*[」』]");
    private static final Pattern LIFE_PLACEHOLDER_TBD_RE =
            Pattern.compile("待检索[：:]\\s*[^；;｜|）)\\n]*");
    private static final Pattern LIFE_OFFICIAL_URL_RE =
            Pattern.compile("(^|\\.)gov\\.cn(/|$|:)|(^|\\.)gov(/|$|:)", Pattern.CASE_INSENSITIVE);
    private static final Pattern LIFE_MEDIA_URL_RE = Pattern.compile(
            "(xinhuanet|people\\.com\\.cn|news\\.cn|chinanews|chinadaily|cctv|gmw\\.cn|moe\\.gov)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern LIFE_HTTP_RE = Pattern.compile("^https?://", Pattern.CASE_INSENSITIVE);

    // ==================================================================
    // 文本常量（system prompt，逐字符对齐 server.js）
    // ==================================================================

    public static final String LIFE_DATE_ANCHOR_RULES =
            "【日期锚定铁律（最高优先级，优先于其它一切排版与拆解规则）】\n"
                    + "1. 提问上下文里的【今天】是唯一时间基准。所有任务节点、每日任务、里程碑与外部事件的日期，一律写成绝对公历日期 YYYY-MM-DD；\n"
                    + "   禁止用「近期 / 中期 / 远期 / 一个月内 / 下个月 / 年底 / 备考期」这类相对刻度或模糊词当作 horizon（时间刻度只允许保留给「几年后」的远期人生推演 milestone）。\n"
                    + "2. 备考 / 考试 / 考证 / 报名 / 截止 / 面试 / 答辩类目标（四级、考研、国考、软考、论文答辩、招聘截止…）必须先把该事项的**真实举办日期**确定下来（联网查实，或用用户已明确给出的日期），再以它为锚点向前倒排：\n"
                    + "   · 该赛道末端【正式考试日 / 截止日】milestone 的 horizon ＝ 真实日期，标题写「日期 + 时间 + 名称」；\n"
                    + "   · 这条赛道上所有报名、复习、刷题、模拟、打印准考证等任务的 horizon 必须**早于**真实考试日，并且必须由「考试日 − 备考周期」倒推成具体日期；\n"
                    + "   · 严禁把这些任务的 horizon 写成「中期」这类模糊刻度；严禁把任何备考任务排到考试日**之后**（那等于规划出来就已经错过考试，属于严重错误）。\n"
                    + "3. 真实日期暂时查不到时：horizon 留空，改为写一条待检索（op=\"queue_search\"，字段 query / nodeId / priority / estCost），并把这些任务先排在「未知考试日」之前的合理区间，绝不允许拿一个模糊刻度顶替真实日期。\n"
                    + "4. 禁止把任何任务 / 事件的日期排在【今天】之前的过去时间（复盘已发生的事除外）；如果按备考周期倒推出来是过去的日期，说明该事项已经过期，必须改为「已错过，需重新规划」并在 detail 里说明，不要硬排一个过期日期。\n"
                    + "5. 每次输出前自查一遍：这条赛道的正式考试日是哪天？我排的每个任务是不是都在它之前？有没有出现「中期 / 远期」这种没落到具体日期的写法？\n"
                    + "6. 赛道节点与目标节点必须自带 startDate（开始日期）与 horizon（截止日期）：赛道 / 目标本身没有天然日期时，取它下面最早任务日作为 startDate、最晚里程碑日作为 horizon，\n"
                    + "   画布要能显示成「开始日期 → 结束日期」；只给「近期 / 中期」这种刻度标签就等于没排期，用户看不出这条赛道什么时候开始、什么时候结束。\n"
                    + "7. 时间必须铺满整条时间线，禁止把整张图全压在一周内：每条赛道至少要有 近期（本周内）、中期（1~3 个月）、远期（3 个月以上，例如出成绩、面试、上岸、副业变现）三档各 1 条可执行任务或里程碑，\n"
                    + "   时间跨度长的赛道要把「远期」拆成阶段里程碑，让用户能看出这条路要走多久、在哪里收尾。\n"
                    + "8. 周期性任务（刷题 / 背单词 / 练听力 / 复盘 / 打卡）必须写清「从哪天开始、重复到哪天结束」（一般到考试前一日为止），不能只出现在某一天：startDate 写起始日，horizon 写结束日，repeat 写「每日重复」。";

    public static final String LIFE_CHAT_SYSTEM =
            "你是全维度人生规划智能助手，拥有 web_search 联网检索工具，冷静、务实、不灌鸡汤、不画饼。\n"
                    + "先判断用户这句话属于哪一类意图：查询信息 / 修改计划 / 记录任务完成情况 / 学习方法咨询 / 复盘本周进度 / 推演未来路线 / 调整赛道目标。\n"
                    + "若涉及实时数据（行业就业与薪资、考试报名与考试时间、报考政策、物价汇率、营养标准等），按需调用 web_search；纯粹的个人推演、计划排期、风险预判、概念解释不要联网。\n"
                    + "用户只是在**修改他自己的规划**时（例：「我不考听力」「这步不做了」「改成每周一次」「把这条删掉」「换一个目标」），属于「改规划」不是「查资料」：直接按新意图增删改规划网络里的节点与任务，不要联网检索，更不要去核实或质疑他的决定是否成立 —— 他说不考就是不考，不需要你查资料证明这个决定对不对。只有他自己明确要查实时信息（报名时间、政策、官网、价格等）时才检索。\n"
                    + "检索次数是按需的：同一个问题最多可检索 3 次。一次并列提出最关键的 1~3 个关键词，拿到结果后如果还缺关键资料（例如只搜到考试科目、没搜到报名时间），再用新关键词补搜一次；禁止重复检索同一关键词。超过 3 次的检索需求会被系统转入待审批队列（不付费、当时拿不到结果），所以优先把最关键的查询一次提全。\n"
                    + "生成 query 时只锁定「核心实体 + 目标时间 + 问题领域」，一轮最多 1~2 条，不把多年份、多实体、无关宽泛词（日历 / calendar 之类）塞进同一条 query；涉及招考 / 考试时必须区分「招考届次」与「自然年份」（2027 届国考 ≠ 2027 自然年），同一条 query 不混多届名称。";

    public static final String LIFE_PERSONA_DERIVE_SYSTEM =
            "你是人生规划分析师。用户会给你一份「规划完成度事实清单」，全部来自他规划网络与每日任务里的真实数据。\n"
                    + "\n"
                    + "请据此反推他此刻的人物画像。只依据清单里的数字与标题，不要凭空想象，不要夸奖或批评，不要灌鸡汤。\n"
                    + "输出一个 JSON 对象，7 个维度各给 2 到 4 条短句，每条 12 到 30 字，口语化、具体、能一眼看懂：\n"
                    + "{\"state\":[],\"abilities\":[],\"habits\":[],\"traits\":[],\"resources\":[],\"future\":[],\"advantage\":[]}\n"
                    + "\n"
                    + "要求：\n"
                    + "1. 每条结论都必须能对上清单里的数字或标题（例如「已完成 14 / 51 项」「4 条延期里有 3 条是英语」），禁止「你很努力」「继续保持」这类没有依据的空话。\n"
                    + "2. resources 是统计口径，不是网址列表：写「已收集 N 个官方入口 / 已有 X 资料与题库」，不要把节点标题里的网址原样抄成一条。\n"
                    + "3. future 写「按他现在的实际状态，未来 1 到 3 年能承接的具体事情」（结合各赛道的完成率与剩余时间），例如「按当前节奏可在 2027 年报考软考高级」。依据不足时直接写「数据太少，暂不足以推断」。\n"
                    + "4. advantage 至少写 1 条优势与 1 条代价/短板，都要能对上清单依据。\n"
                    + "5. 只输出 JSON，不要任何解释文字或代码块标记。";

    private final ObjectMapper objectMapper;

    public LifeSupport(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    // ==================================================================
    // 通用 JS 取值助手
    // ==================================================================

    /** 等价 {@code value || ''}（假值一律为空串）。 */
    public static String orEmpty(Object value) {
        return JsValues.truthy(value) ? JsValues.toJsString(value) : "";
    }

    /** 等价 {@code Number(value) || fallback}。 */
    public static double numOr(Object value, double fallback) {
        Double parsed = JsValues.parse(value);
        if (parsed == null || parsed == 0d) {
            return fallback;
        }
        return parsed;
    }

    /** 等价 {@code Number(value) === target}。 */
    public static boolean numEquals(Object value, double target) {
        Double parsed = JsValues.parse(value);
        return parsed != null && parsed == target;
    }

    /** 等价 JS {@code String(value)}（默认空串）。 */
    public static String str(Object value) {
        return value == null ? "" : JsValues.toJsString(value);
    }

    /** 等价 JS {@code Number(text)}（无法解析得 NaN）。 */
    public static Double jsNumber(String text) {
        if (text == null) {
            return Double.NaN;
        }
        String trimmed = text.trim();
        if (trimmed.isEmpty()) {
            return 0d;
        }
        try {
            return Double.parseDouble(trimmed);
        } catch (NumberFormatException error) {
            return Double.NaN;
        }
    }

    private static boolean jsTruthyNumber(Double value) {
        return value != null && !value.isNaN() && value != 0d;
    }

    /** 等价 JS {@code String.prototype.trim()}。 */
    public static String trim(Object value) {
        return JsStrings.trim(value == null ? "" : JsValues.toJsString(value));
    }

    /** 等价 JS {@code String.prototype.slice(0, max)}（按 UTF-16 code unit）。 */
    public static String slice(String text, int max) {
        String s = text == null ? "" : text;
        return s.length() > max ? s.substring(0, max) : s;
    }

    public static String pad2(Object value) {
        String text = str(value);
        while (text.length() < 2) {
            text = "0" + text;
        }
        return text;
    }

    /** 等价 JS {@code new Date(y, m-1, d)}（月份/日期溢出会被规范化；0~99 年映射到 1900+）。 */
    private static LocalDate jsDate(int year, int monthZeroBased, int day) {
        int y = year;
        if (y >= 0 && y <= 99) {
            y += 1900;
        }
        return LocalDate.of(y, 1, 1).plusMonths(monthZeroBased).plusDays(day - 1L);
    }

    public static String formatLocalDate(LocalDate date) {
        return date.getYear() + "-" + pad2(date.getMonthValue()) + "-" + pad2(date.getDayOfMonth());
    }

    /** 等价 server.js 11258 的 todayStr()。 */
    public String todayStr() {
        return formatLocalDate(LocalDate.now());
    }

    /** 等价 server.js 6520 的 lifeTodayText()。 */
    public String lifeTodayText() {
        LocalDate today = LocalDate.now();
        int index = today.getDayOfWeek().getValue() % 7;
        return todayStr() + " " + LIFE_WEEKDAYS.get(index);
    }

    /** 等价 server.js 9122 的 lifeDateShift（后定义覆盖前定义）。 */
    public String lifeDateShift(Object isoValue, int days) {
        String iso = str(isoValue == null ? "" : orEmpty(isoValue));
        String[] parts = iso.split("-", -1);
        Double y = jsNumber(parts.length > 0 ? parts[0] : null);
        Double m = jsNumber(parts.length > 1 ? parts[1] : null);
        Double d = jsNumber(parts.length > 2 ? parts[2] : null);
        if (!jsTruthyNumber(y) || !jsTruthyNumber(m) || !jsTruthyNumber(d)) {
            return iso;
        }
        LocalDate base = jsDate((int) y.doubleValue(), (int) m.doubleValue() - 1, (int) d.doubleValue());
        return formatLocalDate(base.plusDays(days));
    }

    /** 等价 server.js 9130 的 lifeDaysUntil（后定义覆盖前定义）。 */
    public Integer lifeDaysUntil(Object isoValue) {
        String iso = str(isoValue == null ? "" : orEmpty(isoValue));
        String[] parts = iso.split("-", -1);
        Double y = jsNumber(parts.length > 0 ? parts[0] : null);
        Double m = jsNumber(parts.length > 1 ? parts[1] : null);
        Double d = jsNumber(parts.length > 2 ? parts[2] : null);
        if (!jsTruthyNumber(y) || !jsTruthyNumber(m) || !jsTruthyNumber(d)) {
            return null;
        }
        LocalDate target = jsDate((int) y.doubleValue(), (int) m.doubleValue() - 1, (int) d.doubleValue());
        LocalDate today = LocalDate.now();
        return (int) ChronoUnit.DAYS.between(today, target);
    }

    /** 等价 server.js 6412 的 lifeTimeGroupOf。 */
    public String lifeTimeGroupOf(Object date) {
        Integer days = lifeDaysUntil(date);
        if (days == null) {
            return "";
        }
        return days <= 30 ? "urgent" : (days <= 90 ? "mid" : "future");
    }

    /** 等价 server.js 6420 的 lifeDateFromText。 */
    public String lifeDateFromText(Object textValue) {
        String text = orEmpty(textValue == null ? "" : textValue);
        Matcher matcher = LIFE_CN_DATE_RE.matcher(text);
        if (!matcher.find()) {
            return "";
        }
        return matcher.group(1) + "-" + pad2(matcher.group(2)) + "-" + pad2(matcher.group(3));
    }

    /** 等价 server.js 6530 的 lifeText。 */
    public String lifeText(Object value, int max) {
        String text = trim(value == null ? "" : JsValues.toJsString(value));
        return slice(text, max);
    }

    /** 等价 server.js 6534 的 lifeClampWeight。 */
    public int lifeClampWeight(Object value) {
        Double num = JsValues.parse(value);
        if (num == null || !Double.isFinite(num)) {
            return 50;
        }
        long rounded = Math.round(num);
        return (int) Math.max(1, Math.min(100, rounded));
    }

    /** 等价 server.js 9140 的 lifeNextReviewDate。 */
    public String lifeNextReviewDate(Object baseDate, Object stage) {
        Double parsed = JsValues.parse(stage);
        int raw = (parsed == null || parsed == 0d) ? 0 : (int) parsed.doubleValue();
        int index = Math.max(0, Math.min(LIFE_REVIEW_OFFSETS.size() - 1, raw));
        int offset = LIFE_REVIEW_OFFSETS.get(index);
        if (offset < 0) {
            return "";
        }
        Object base = JsValues.truthy(baseDate) ? baseDate : todayStr();
        return lifeDateShift(base, offset);
    }

    /** 等价 server.js 9147 的 lifeDateOf。 */
    public String lifeDateOf(Object ts) {
        Double parsed = JsValues.parse(ts);
        long millis = (parsed == null || parsed == 0d)
                ? System.currentTimeMillis() : (long) parsed.doubleValue();
        LocalDate date = java.time.Instant.ofEpochMilli(millis)
                .atZone(java.time.ZoneId.systemDefault()).toLocalDate();
        return formatLocalDate(date);
    }

    // ==================================================================
    // 节点解析（5987-6190 / 6043-6088）
    // ==================================================================

    /** 等价 server.js 5997 的 normalizeLifeTimeGroups（就地改写 item.timeGroup）。 */
    public List<Map<String, Object>> normalizeLifeTimeGroups(List<Map<String, Object>> items) {
        if (items == null || items.isEmpty()) {
            return items;
        }
        LocalDate today = LocalDate.now();
        Map<String, Integer> earliestBySeries = new LinkedHashMap<>();
        for (Map<String, Object> item : items) {
            Integer days = lifeItemDays(item, today);
            if (days == null) {
                continue;
            }
            String key = trim(orEmpty(item.get("series")));
            if (key.isEmpty()) {
                continue;
            }
            Integer best = earliestBySeries.get(key);
            if (best == null || days < best) {
                earliestBySeries.put(key, days);
            }
        }
        for (Map<String, Object> item : items) {
            if ("人生推演".equals(trim(orEmpty(item.get("series"))))) {
                continue;
            }
            Integer days = lifeItemDays(item, today);
            if (days != null) {
                item.put("timeGroup", lifeGroupOfDays(days));
                continue;
            }
            String key = trim(orEmpty(item.get("series")));
            Integer inherited = key.isEmpty() ? null : earliestBySeries.get(key);
            if (inherited != null) {
                item.put("timeGroup", lifeGroupOfDays(inherited));
            }
        }
        return items;
    }

    private Integer lifeItemDays(Map<String, Object> item, LocalDate today) {
        Object horizon = item.containsKey("horizon") ? item.get("horizon") : null;
        Object dueRaw = (horizon == null) ? item.get("dueDate") : horizon;
        LocalDate due = parseLifeItemDate(dueRaw);
        if (due != null) {
            return (int) ChronoUnit.DAYS.between(today, due);
        }
        Object start = item.containsKey("startDate") ? item.get("startDate") : null;
        Object startRaw = (start == null) ? item.get("start_date") : start;
        LocalDate startDate = parseLifeItemDate(startRaw);
        return startDate == null ? null : (int) ChronoUnit.DAYS.between(today, startDate);
    }

    private LocalDate parseLifeItemDate(Object value) {
        Matcher matcher = LIFE_NUMERIC_DATE_RE.matcher(orEmpty(value == null ? "" : value));
        if (!matcher.find()) {
            return null;
        }
        return jsDate(Integer.parseInt(matcher.group(1)),
                Integer.parseInt(matcher.group(2)) - 1,
                Integer.parseInt(matcher.group(3)));
    }

    private static String lifeGroupOfDays(int days) {
        return days <= 30 ? "urgent" : (days <= 90 ? "mid" : "future");
    }

    /** 等价 server.js 6035 的 lifeParseDeps。 */
    public List<String> lifeParseDeps(Object value) {
        if (!JsValues.truthy(value)) {
            return new ArrayList<>();
        }
        List<String> result = new ArrayList<>();
        try {
            Object parsed = objectMapper.readValue(JsValues.toJsString(value), Object.class);
            if (parsed instanceof List<?> list) {
                for (Object item : list) {
                    if (item == null) {
                        result.add("null");
                    } else if (item instanceof Map || item instanceof List) {
                        result.add(String.valueOf(item));
                    } else {
                        result.add(JsValues.toJsString(item));
                    }
                }
            }
        } catch (Exception ignored) {
            return new ArrayList<>();
        }
        result.removeIf(String::isEmpty);
        return result;
    }

    /** 等价 server.js 6047 的 lifeContentType。 */
    public String lifeContentType(Map<String, Object> row) {
        String given = orEmpty(row.get("content_type")).trim().toLowerCase(Locale.ROOT);
        if (LIFE_CONTENT_TYPES.contains(given)) {
            return given;
        }
        String kind = orEmpty(row.get("kind"));
        if ("milestone".equals(kind)) {
            return "branch";
        }
        String text = orEmpty(row.get("title")) + " " + orEmpty(row.get("detail"));
        if (LIFE_CT_TABLE_RE.matcher(text).find()) {
            return "table";
        }
        if (LIFE_CT_PROGRESS_RE.matcher(text).find()) {
            return "progress";
        }
        if (LIFE_CT_CALC_RE.matcher(text).find()) {
            return "calc";
        }
        if (LIFE_CT_DOC_RE.matcher(text).find()) {
            return "doc";
        }
        if (LIFE_CT_LINK_RE.matcher(text).find()) {
            return "link";
        }
        if ("action".equals(kind)) {
            return "checklist";
        }
        return "text";
    }

    /** 等价 server.js 6063 的 lifeParseBody。 */
    public Object lifeParseBody(Object value) {
        String text = trim(orEmpty(value == null ? "" : value));
        if (text.isEmpty()) {
            return null;
        }
        try {
            Object parsed = objectMapper.readValue(text, Object.class);
            if (parsed instanceof Map || parsed instanceof List) {
                return parsed;
            }
            return null;
        } catch (Exception ignored) {
            return null;
        }
    }

    /** 等价 server.js 6074 的 lifeTitleKey。 */
    public String lifeTitleKey(Object value) {
        String text = JsStrings.removeAllWhitespace(orEmpty(value == null ? "" : value));
        text = LIFE_TITLE_PUNCT.matcher(text).replaceAll("");
        return text.toLowerCase(Locale.ROOT);
    }

    /** 等价 server.js 6083 的 extractLifeSummary。 */
    public String extractLifeSummary(Object raw) {
        String text = orEmpty(raw == null ? "" : raw);
        Matcher matcher = Pattern.compile("\"summary\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"").matcher(text);
        if (!matcher.find()) {
            return "";
        }
        String inner = matcher.group(1);
        try {
            Object parsed = objectMapper.readValue("\"" + inner + "\"", Object.class);
            return parsed == null ? "" : String.valueOf(parsed);
        } catch (Exception ignored) {
            return inner;
        }
    }

    /** 等价 server.js 6089 的 lifeNodeOut。 */
    public Map<String, Object> lifeNodeOut(Map<String, Object> row) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", row.get("id"));
        out.put("parentId", orEmpty(row.get("parent_id")));
        out.put("kind", JsValues.orDefault(row.get("kind"), "goal"));
        out.put("domain", JsValues.orDefault(row.get("domain"), "成长"));
        out.put("title", orEmpty(row.get("title")));
        out.put("detail", orEmpty(row.get("detail")));
        out.put("risk", orEmpty(row.get("risk")));
        out.put("priority", orEmpty(row.get("priority")));
        out.put("series", orEmpty(row.get("series")));
        out.put("status", JsValues.orDefault(row.get("status"), "todo"));
        out.put("horizon", orEmpty(row.get("horizon")));
        out.put("startDate", orEmpty(row.get("start_date")));
        out.put("weight", numOr(row.get("weight"), 50));
        String timeGroup = orEmpty(row.get("time_group"));
        out.put("timeGroup", LIFE_TIME_GROUPS.contains(timeGroup) ? timeGroup : "");
        out.put("deps", lifeParseDeps(row.get("deps")));
        out.put("referenceIds", lifeParseDeps(row.get("reference_ids")));
        out.put("shared", numEquals(row.get("is_shared"), 1));
        out.put("stepNo", numOr(row.get("step_no"), 0));
        out.put("contentType", lifeContentType(row));
        out.put("contentBody", lifeParseBody(row.get("content_body")));
        out.put("progressNote", orEmpty(row.get("progress_note")));
        out.put("source", JsValues.orDefault(row.get("source"), "ai"));
        out.put("sortOrder", numOr(row.get("sort_order"), 0));
        out.put("createdAt", numOr(row.get("created_at"), 0));
        out.put("updatedAt", numOr(row.get("updated_at"), 0));
        return out;
    }

    /** 等价 server.js 6169 的 lifePlanBrief。 */
    public Map<String, Object> lifePlanBrief(Object nodesValue) {
        List<Map<String, Object>> list = nodesValue instanceof List<?> raw
                ? castList(raw) : new ArrayList<>();
        String soon = lifeDateShift(todayStr(), 60);
        List<Map<String, Object>> detail = new ArrayList<>();
        List<Map<String, Object>> index = new ArrayList<>();
        for (Map<String, Object> node : list) {
            if (lifeNeedsDetail(node, soon)) {
                detail.add(node);
            } else {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", node.get("id"));
                item.put("title", node.get("title"));
                item.put("status", node.get("status"));
                index.add(item);
            }
        }
        detail.sort((a, b) -> {
            String ha = orEmpty(a.get("horizon"));
            if (ha.isEmpty()) {
                ha = "9999";
            }
            String hb = orEmpty(b.get("horizon"));
            if (hb.isEmpty()) {
                hb = "9999";
            }
            int cmp = ha.compareTo(hb);
            if (cmp != 0) {
                return cmp;
            }
            return Double.compare(numOr(b.get("weight"), 0), numOr(a.get("weight"), 0));
        });
        List<Map<String, Object>> briefDetail = new ArrayList<>();
        for (Map<String, Object> node : detail) {
            if (briefDetail.size() >= 80) {
                break;
            }
            briefDetail.add(lifeNodeBrief(node));
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total", list.size());
        result.put("note", "detail 是可改字段的节点（骨架 / 未来 60 天 / 高权重）；index 是其余节点的标题索引，只用于判断「这件事是否已有节点」——同一件事在 detail 或 index 里出现过，就必须用 update，禁止再新增。");
        result.put("detail", briefDetail);
        result.put("index", index);
        return result;
    }

    private boolean lifeNeedsDetail(Map<String, Object> node, String soon) {
        if ("self".equals(node.get("kind")) || "domain".equals(node.get("kind"))) {
            return true;
        }
        String horizon = orEmpty(node.get("horizon"));
        if (LIFE_DATE_RE.matcher(horizon).matches() && horizon.compareTo(soon) <= 0) {
            return true;
        }
        return numOr(node.get("weight"), 0) >= 70;
    }

    private Map<String, Object> lifeNodeBrief(Map<String, Object> node) {
        Map<String, Object> brief = new LinkedHashMap<>();
        brief.put("id", node.get("id"));
        brief.put("kind", node.get("kind"));
        brief.put("domain", node.get("domain"));
        brief.put("title", node.get("title"));
        brief.put("status", node.get("status"));
        brief.put("startDate", node.get("startDate"));
        brief.put("horizon", node.get("horizon"));
        brief.put("weight", node.get("weight"));
        brief.put("priority", node.get("priority"));
        brief.put("series", node.get("series"));
        brief.put("timeGroup", node.get("timeGroup"));
        brief.put("deps", node.get("deps"));
        brief.put("stepNo", node.get("stepNo"));
        return brief;
    }

    // ==================================================================
    // 动态画像（6223-6335）
    // ==================================================================

    /** 等价 server.js 6233 的 computePersonaStats。 */
    public Map<String, Object> computePersonaStats(Object nodesValue, Object tasksValue) {
        List<Map<String, Object>> nodes = nodesValue instanceof List<?> raw ? castList(raw) : new ArrayList<>();
        List<Map<String, Object>> tasks = tasksValue instanceof List<?> raw ? castList(raw) : new ArrayList<>();

        List<Map<String, Object>> alive = new ArrayList<>();
        for (Map<String, Object> node : nodes) {
            if (!"drop".equals(str(node.get("status")))) {
                alive.add(node);
            }
        }

        Map<String, Map<String, Object>> seriesMap = new LinkedHashMap<>();
        for (Map<String, Object> node : alive) {
            // 等价 String(node.series || node.domain || '未分组').trim() || '未分组'
            Object bucket = JsValues.truthy(node.get("series"))
                    ? node.get("series")
                    : (JsValues.truthy(node.get("domain")) ? node.get("domain") : "未分组");
            String key = trim(bucket);
            if (key.isEmpty()) {
                key = "未分组";
            }
            Map<String, Object> item = seriesMap.get(key);
            if (item == null) {
                item = new LinkedHashMap<>();
                item.put("series", key);
                item.put("total", 0);
                item.put("done", 0);
                item.put("doing", 0);
                item.put("delay", 0);
                item.put("overdue", 0);
                item.put("next", "");
                item.put("titles", new ArrayList<String>());
                seriesMap.put(key, item);
            }
            item.put("total", (int) item.get("total") + 1);
            String status = JsValues.orDefault(node.get("status"), "todo");
            if ("done".equals(status)) {
                item.put("done", (int) item.get("done") + 1);
            } else if ("doing".equals(status)) {
                item.put("doing", (int) item.get("doing") + 1);
            } else if ("delay".equals(status)) {
                item.put("delay", (int) item.get("delay") + 1);
            }
            Integer days = lifeDaysUntil(node.get("horizon"));
            if (!"done".equals(status) && days != null && days < 0) {
                item.put("overdue", (int) item.get("overdue") + 1);
            }
            Object horizon = node.get("horizon");
            if (JsValues.truthy(horizon)) {
                String next = str(item.get("next"));
                if (next.isEmpty() || str(horizon).compareTo(next) < 0) {
                    item.put("next", str(horizon));
                }
            }
            String kind = str(node.get("kind"));
            @SuppressWarnings("unchecked")
            List<String> titles = (List<String>) item.get("titles");
            if ((kind.equals("action") || kind.equals("goal") || kind.equals("milestone")) && titles.size() < 6) {
                titles.add(str(node.get("title")) + "（" + status
                        + (JsValues.truthy(horizon) ? " · " + str(horizon) : "") + "）");
            }
        }

        Map<String, Object> repeatCount = new LinkedHashMap<>();
        repeatCount.put("daily", 0);
        repeatCount.put("weekday", 0);
        repeatCount.put("weekly", 0);
        repeatCount.put("once", 0);
        repeatCount.put("", 0);
        for (Map<String, Object> task : tasks) {
            String key = str(task.get("repeat"));
            if (!repeatCount.containsKey(key)) {
                key = "";
            }
            repeatCount.put(key, (int) repeatCount.get(key) + 1);
        }

        List<Map<String, Object>> recent = new ArrayList<>();
        for (int i = 13; i >= 0; i -= 1) {
            String date = lifeDateShift(todayStr(), -i);
            int total = 0;
            int done = 0;
            for (Map<String, Object> task : tasks) {
                if (slice(orEmpty(task.get("date")), 10).equals(date)) {
                    total += 1;
                    if ("done".equals(str(task.get("status")))) {
                        done += 1;
                    }
                }
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("date", date);
            row.put("total", total);
            row.put("done", done);
            recent.add(row);
        }

        List<Map<String, Object>> resourceNodes = new ArrayList<>();
        for (Map<String, Object> node : alive) {
            if ("action".equals(node.get("kind"))) {
                continue;
            }
            String text = str(node.get("title")) + " " + orEmpty(node.get("detail"));
            if (LIFE_RESOURCE_TITLE_RE.matcher(text).find()) {
                resourceNodes.add(node);
            }
        }

        LinkedHashSet<String> allLinks = new LinkedHashSet<>();
        for (Map<String, Object> node : alive) {
            allLinks.addAll(lifeUrlsIn(orEmpty(node.get("detail")) + " " + orEmpty(node.get("risk"))));
        }

        List<Map<String, Object>> doneNodes = new ArrayList<>();
        List<Map<String, Object>> delayNodes = new ArrayList<>();
        List<Map<String, Object>> upcomingNodes = new ArrayList<>();
        List<Map<String, Object>> urgentNodes = new ArrayList<>();
        List<Map<String, Object>> examNodes = new ArrayList<>();
        int total = alive.size();
        for (Map<String, Object> node : alive) {
            String status = str(node.get("status"));
            if ("done".equals(status)) {
                doneNodes.add(node);
            }
            if ("delay".equals(status)) {
                delayNodes.add(node);
            }
            Integer days = lifeDaysUntil(node.get("horizon"));
            if (days != null && days >= 0 && days <= 90 && "todo".equals(status)) {
                upcomingNodes.add(node);
            }
            if (days != null && days >= 0 && days <= 30 && !"done".equals(status)) {
                urgentNodes.add(node);
            }
            if (LIFE_EXAM_TITLE_RE.matcher(str(node.get("title"))).find()) {
                examNodes.add(node);
            }
        }

        upcomingNodes.sort((a, b) -> str(a.get("horizon")).compareTo(str(b.get("horizon"))));

        List<String> doneSample = new ArrayList<>();
        for (Map<String, Object> node : doneNodes) {
            if (doneSample.size() >= 20) {
                break;
            }
            doneSample.add(str(node.get("title")));
        }
        List<String> blockedSample = new ArrayList<>();
        for (Map<String, Object> node : delayNodes) {
            if (blockedSample.size() >= 10) {
                break;
            }
            blockedSample.add(str(node.get("title")) + "（截止 " + JsValues.orDefault(node.get("horizon"), "未定") + "）");
        }
        List<String> upcoming = new ArrayList<>();
        for (Map<String, Object> node : upcomingNodes) {
            if (upcoming.size() >= 10) {
                break;
            }
            String priority = LIFE_PRIORITY_PREFIX_RE.matcher(orEmpty(node.get("priority"))).replaceFirst("");
            upcoming.add(str(node.get("horizon")) + "｜" + str(node.get("title")) + "｜P"
                    + (priority.isEmpty() ? "-" : priority));
        }
        List<String> resources = new ArrayList<>();
        for (Map<String, Object> node : resourceNodes) {
            if (resources.size() >= 15) {
                break;
            }
            resources.add(str(node.get("title")));
        }
        List<String> examSamples = new ArrayList<>();
        for (Map<String, Object> node : examNodes) {
            if (examSamples.size() >= 10) {
                break;
            }
            examSamples.add(str(node.get("title")) + "（" + str(node.get("status")) + " · "
                    + JsValues.orDefault(node.get("horizon"), "未定") + "）");
        }

        List<Map<String, Object>> series = new ArrayList<>();
        for (Map<String, Object> item : seriesMap.values()) {
            Map<String, Object> copy = new LinkedHashMap<>(item);
            series.add(copy);
        }
        series.sort((a, b) -> Integer.compare((int) b.get("total"), (int) a.get("total")));
        if (series.size() > 8) {
            series = new ArrayList<>(series.subList(0, 8));
        }

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("today", todayStr());
        stats.put("nodeTotal", total);
        stats.put("nodeDone", doneNodes.size());
        stats.put("nodeDoing", lifeCountStatus(alive, "doing"));
        stats.put("nodeDelay", lifeCountStatus(alive, "delay"));
        stats.put("nodeDrop", nodes.size() - total);
        stats.put("completionRate", total > 0 ? (int) Math.round((doneNodes.size() / (double) total) * 100) : 0);
        stats.put("taskTotal", tasks.size());
        stats.put("taskDone", lifeCountTaskStatus(tasks, "done"));
        stats.put("taskDelay", lifeCountTaskStatus(tasks, "delay"));
        stats.put("repeatCount", repeatCount);
        stats.put("recent", recent);
        stats.put("series", series);
        stats.put("doneSample", doneSample);
        stats.put("blockedSample", blockedSample);
        stats.put("urgent", urgentNodes.size());
        stats.put("upcoming", upcoming);
        stats.put("resources", resources);
        stats.put("linkCount", allLinks.size());
        stats.put("examNodes", examSamples);
        return stats;
    }

    private static int lifeCountStatus(List<Map<String, Object>> list, String status) {
        int count = 0;
        for (Map<String, Object> item : list) {
            if (status.equals(str(item.get("status")))) {
                count += 1;
            }
        }
        return count;
    }

    private static int lifeCountTaskStatus(List<Map<String, Object>> list, String status) {
        int count = 0;
        for (Map<String, Object> item : list) {
            if (status.equals(str(item.get("status")))) {
                count += 1;
            }
        }
        return count;
    }

    /** 等价 server.js 6325 的 lifePersonaSignature。 */
    public String lifePersonaSignature(Map<String, Object> stats) {
        Map<String, Object> basis = new LinkedHashMap<>();
        basis.put("n", List.of(numOr(stats.get("nodeTotal"), 0), numOr(stats.get("nodeDone"), 0),
                numOr(stats.get("nodeDoing"), 0), numOr(stats.get("nodeDelay"), 0), numOr(stats.get("nodeDrop"), 0)));
        basis.put("t", List.of(numOr(stats.get("taskTotal"), 0), numOr(stats.get("taskDone"), 0),
                numOr(stats.get("taskDelay"), 0)));
        basis.put("r", stats.get("repeatCount"));
        List<Object> seriesBasis = new ArrayList<>();
        if (stats.get("series") instanceof List<?> series) {
            for (Object item : series) {
                if (item instanceof Map<?, ?> map) {
                    seriesBasis.add(List.of(str(map.get("series")), numOr(map.get("total"), 0),
                            numOr(map.get("done"), 0), numOr(map.get("delay"), 0)));
                }
            }
        }
        basis.put("s", seriesBasis);
        basis.put("d", stats.get("doneSample"));
        basis.put("b", stats.get("blockedSample"));
        return sha1Hex(jsonStringify(basis, null));
    }

    /** 等价 server.js 6304 的 lifeDerivedOut。 */
    public Map<String, Object> lifeDerivedOut(Map<String, Object> row) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("updatedAt", numOr(row == null ? null : row.get("updated_at"), 0));
        out.put("progress", null);
        for (Map<String, Object> dim : LIFE_PERSONA_DERIVED_DIMS) {
            String key = str(dim.get("key"));
            out.put(key, str(row == null ? null : row.get(key)));
        }
        try {
            Object raw = row == null ? null : row.get("progress_json");
            out.put("progress", JsValues.truthy(raw)
                    ? objectMapper.readValue(JsValues.toJsString(raw), Object.class) : null);
        } catch (Exception ignored) {
            out.put("progress", null);
        }
        return out;
    }

    // ==================================================================
    // 考试锚点（7167-7299）
    // ==================================================================

    /** 等价 server.js 7178 的 lifeExamAnchors。 */
    public List<Map<String, Object>> lifeExamAnchors(Object text, Object declared) {
        List<Map<String, Object>> merged = new ArrayList<>();
        LinkedHashSet<String> seen = new LinkedHashSet<>();
        List<Map<String, Object>> list = declared instanceof List<?> raw ? castList(raw) : new ArrayList<>();
        for (Map<String, Object> item : list) {
            String subject = lifeText(item.get("subject"), 60);
            if (subject.isEmpty()) {
                continue;
            }
            Object examDateRaw = JsValues.truthy(item.get("examDate")) ? item.get("examDate") : item.get("date");
            String examDate = lifeText(examDateRaw, 10);
            if (!LIFE_DATE_RE.matcher(str(examDate)).matches()) {
                continue;
            }
            String key = lifeTitleKey(subject);
            if (key.isEmpty() || seen.contains(key)) {
                continue;
            }
            seen.add(key);
            String examTitle = lifeText(item.get("examTitle"), 200);
            if (examTitle.isEmpty()) {
                examTitle = examDate + " " + subject;
            }
            String ticketStart = LIFE_DATE_RE.matcher(orEmpty(item.get("ticketStart"))).matches()
                    ? str(item.get("ticketStart")) : lifeDateShift(examDate, -7);
            String ticketEnd = LIFE_DATE_RE.matcher(orEmpty(item.get("ticketEnd"))).matches()
                    ? str(item.get("ticketEnd")) : lifeDateShift(examDate, -1);
            Map<String, Object> anchor = new LinkedHashMap<>();
            anchor.put("subject", subject);
            anchor.put("keys", new ArrayList<>(List.of(subject)));
            anchor.put("examDate", examDate);
            anchor.put("examTitle", examTitle);
            anchor.put("ticketStart", ticketStart);
            anchor.put("ticketEnd", ticketEnd);
            anchor.put("officialUrl", lifeText(item.get("officialUrl"), 300));
            anchor.put("printUrl", lifeText(item.get("printUrl"), 300));
            merged.add(anchor);
        }
        return merged;
    }

    /** 等价 server.js 7206 的 lifeAnchorMatches。 */
    public boolean lifeAnchorMatches(Map<String, Object> anchor, Object text) {
        String haystack = orEmpty(text == null ? "" : text);
        List<String> keys = new ArrayList<>();
        keys.add(str(anchor.get("subject")));
        if (anchor.get("keys") instanceof List<?> raw) {
            for (Object item : raw) {
                keys.add(item == null ? "" : JsValues.toJsString(item));
            }
        }
        for (String key : keys) {
            if (!key.isEmpty() && key.length() >= 2 && haystack.contains(key)) {
                return true;
            }
        }
        return false;
    }

    /** 等价 server.js 7259 的 lifeDerivedAnchors。 */
    public List<Map<String, Object>> lifeDerivedAnchors(Object itemsValue, Object existingValue) {
        List<Map<String, Object>> items = itemsValue instanceof List<?> raw ? castList(raw) : new ArrayList<>();
        List<Map<String, Object>> existing =
                existingValue instanceof List<?> raw ? castList(raw) : new ArrayList<>();
        LinkedHashSet<String> covered = new LinkedHashSet<>();
        for (Map<String, Object> anchor : existing) {
            covered.add(lifeTitleKey(anchor.get("subject")));
        }
        List<Map<String, Object>> derived = new ArrayList<>();
        for (Map<String, Object> item : items) {
            String horizon = lifeText(item.get("horizon"), 32);
            if (!LIFE_DATE_RE.matcher(horizon).matches()) {
                continue;
            }
            String title = trim(orEmpty(item.get("title")));
            if (!LIFE_EXAM_DAY_RE.matcher(title).find() || LIFE_ZHUNKAO_RE.matcher(title).find()) {
                continue;
            }
            String haystack = title + " " + orEmpty(item.get("series"));
            boolean matched = false;
            for (Map<String, Object> anchor : existing) {
                if (lifeAnchorMatches(anchor, haystack)) {
                    matched = true;
                    break;
                }
            }
            if (matched) {
                continue;
            }
            String series = trim(orEmpty(item.get("series")));
            String base = (series.isEmpty() || LIFE_DERIVE_SERIES_RE.matcher(series).find()) ? title : series;
            String subject = lifeText(LIFE_CN_DATE_STRIP_RE.matcher(base).replaceAll("").trim(), 60);
            String key = lifeTitleKey(subject);
            if (key.isEmpty() || covered.contains(key)) {
                continue;
            }
            covered.add(key);
            List<String> urls = lifeUrlsIn(str(item.get("detail")) + " " + str(item.get("risk")));
            Map<String, Object> anchor = new LinkedHashMap<>();
            anchor.put("subject", subject);
            anchor.put("keys", new ArrayList<>(List.of(subject)));
            anchor.put("examDate", horizon);
            anchor.put("examTitle", horizon + " " + subject);
            anchor.put("ticketStart", lifeDateShift(horizon, -7));
            anchor.put("ticketEnd", lifeDateShift(horizon, -1));
            anchor.put("officialUrl", urls.size() > 0 ? urls.get(0) : "");
            anchor.put("printUrl", urls.size() > 1 ? urls.get(1) : (urls.size() > 0 ? urls.get(0) : ""));
            derived.add(anchor);
        }
        return derived;
    }

    /** 等价 server.js 7291 的 lifeAnchorIndex。 */
    public int lifeAnchorIndex(Object itemsValue, Map<String, Object> anchor) {
        List<Map<String, Object>> items = itemsValue instanceof List<?> raw ? castList(raw) : new ArrayList<>();
        String examDate = str(anchor.get("examDate"));
        for (int i = 0; i < items.size(); i++) {
            Map<String, Object> item = items.get(i);
            if (lifeText(item.get("horizon"), 32).equals(examDate)
                    && lifeAnchorMatches(anchor, item.get("title"))) {
                return i;
            }
        }
        for (int i = 0; i < items.size(); i++) {
            Map<String, Object> item = items.get(i);
            if (Pattern.compile("考试|笔试|开考").matcher(str(item.get("title"))).find()
                    && lifeAnchorMatches(anchor, str(item.get("title")) + " " + orEmpty(item.get("series")))) {
                return i;
            }
        }
        for (int i = 0; i < items.size(); i++) {
            Map<String, Object> item = items.get(i);
            if ("domain".equals(str(item.get("kind")))
                    && lifeAnchorMatches(anchor, str(item.get("title")) + " " + orEmpty(item.get("series")))) {
                return i;
            }
        }
        return -1;
    }

    // ==================================================================
    // 文本 / 转录（6524-6532 / 7121）
    // ==================================================================

    /** 等价 server.js 6524 的 lifeTranscript。 */
    public String lifeTranscript(Object messagesValue) {
        List<Map<String, Object>> messages =
                messagesValue instanceof List<?> raw ? castList(raw) : new ArrayList<>();
        StringBuilder builder = new StringBuilder();
        boolean first = true;
        for (Map<String, Object> message : messages) {
            if (!first) {
                builder.append('\n');
            }
            first = false;
            String speaker = "user".equals(message.get("role")) ? "我" : "导师";
            builder.append(speaker).append("：").append(slice(orEmpty(message.get("content")), 800));
        }
        return builder.toString();
    }

    /** 等价 server.js 7121 的 recentLifeTranscript。 */
    public String recentLifeTranscript(Object messagesValue, int limit) {
        List<Map<String, Object>> messages =
                messagesValue instanceof List<?> raw ? castList(raw) : new ArrayList<>();
        List<Map<String, Object>> filtered = new ArrayList<>();
        for (Map<String, Object> message : messages) {
            Object role = message.get("role");
            if ("user".equals(role) || "assistant".equals(role)) {
                filtered.add(message);
            }
        }
        // 等价 JS Array.prototype.slice(-limit)：正数取末尾 limit 条，0 取全部，负数从头部偏移
        int from = limit > 0 ? Math.max(0, filtered.size() - limit)
                : (limit == 0 ? 0 : Math.min(filtered.size(), -limit));
        return lifeTranscript(new ArrayList<>(filtered.subList(from, filtered.size())));
    }

    // ==================================================================
    // JSON 解析 / 输出（6983-7021）
    // ==================================================================

    /** 等价 server.js 6983 的 parseLifeJson。 */
    public Object parseLifeJson(Object raw) {
        String text = orEmpty(raw == null ? "" : raw);
        Matcher matcher = LIFE_JSON_BLOCK.matcher(text);
        if (!matcher.find()) {
            return null;
        }
        try {
            return objectMapper.readValue(matcher.group(), Object.class);
        } catch (Exception ignored) {
            return null;
        }
    }

    /** 等价 server.js 6992 的 salvageJsonObjects。 */
    public List<Object> salvageJsonObjects(Object raw) {
        String text = orEmpty(raw == null ? "" : raw);
        int start = text.indexOf('[');
        if (start < 0) {
            return null;
        }
        List<Object> objects = new ArrayList<>();
        int depth = 0;
        StringBuilder buffer = new StringBuilder();
        boolean inStr = false;
        boolean esc = false;
        for (int i = start + 1; i < text.length(); i += 1) {
            char ch = text.charAt(i);
            if (inStr) {
                buffer.append(ch);
                if (esc) {
                    esc = false;
                } else if (ch == '\\') {
                    esc = true;
                } else if (ch == '"') {
                    inStr = false;
                }
                continue;
            }
            if (ch == '"') {
                inStr = true;
                buffer.append(ch);
                continue;
            }
            if (ch == '{') {
                depth += 1;
                buffer.append(ch);
                continue;
            }
            if (ch == '}') {
                depth -= 1;
                buffer.append(ch);
                if (depth == 0) {
                    try {
                        objects.add(objectMapper.readValue(buffer.toString(), Object.class));
                    } catch (Exception ignored) {
                        // 单条坏对象跳过
                    }
                    buffer.setLength(0);
                }
                continue;
            }
            if (depth > 0) {
                buffer.append(ch);
            }
        }
        return objects.isEmpty() ? null : objects;
    }

    /** 等价 JS {@code JSON.stringify(value)} / {@code JSON.stringify(value, null, space)}。 */
    public String jsonStringify(Object value, Integer space) {
        StringBuilder builder = new StringBuilder();
        try {
            writeJson(builder, value, space == null ? -1 : space, 0);
        } catch (Exception ignored) {
            return "null";
        }
        return builder.toString();
    }

    private void writeJson(StringBuilder builder, Object value, int space, int depth) throws Exception {
        if (value == null) {
            builder.append("null");
            return;
        }
        if (value instanceof Map<?, ?> map) {
            if (map.isEmpty()) {
                builder.append("{}");
                return;
            }
            builder.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (!first) {
                    builder.append(',');
                }
                first = false;
                if (space >= 0) {
                    builder.append('\n').append(" ".repeat(space * (depth + 1)));
                }
                builder.append(quote(JsValues.toJsString(entry.getKey()))).append(':');
                if (space >= 0) {
                    builder.append(' ');
                }
                writeJson(builder, entry.getValue(), space, depth + 1);
            }
            if (space >= 0) {
                builder.append('\n').append(" ".repeat(space * depth));
            }
            builder.append('}');
            return;
        }
        if (value instanceof List<?> list) {
            if (list.isEmpty()) {
                builder.append("[]");
                return;
            }
            builder.append('[');
            boolean first = true;
            for (Object item : list) {
                if (!first) {
                    builder.append(',');
                }
                first = false;
                if (space >= 0) {
                    builder.append('\n').append(" ".repeat(space * (depth + 1)));
                }
                writeJson(builder, item, space, depth + 1);
            }
            if (space >= 0) {
                builder.append('\n').append(" ".repeat(space * depth));
            }
            builder.append(']');
            return;
        }
        if (value instanceof String text) {
            builder.append(quote(text));
            return;
        }
        if (value instanceof Boolean bool) {
            builder.append(bool ? "true" : "false");
            return;
        }
        if (value instanceof Number number) {
            double d = number.doubleValue();
            if (!Double.isFinite(d)) {
                builder.append("null");
            } else if (d == Math.rint(d) && Math.abs(d) < 1e21) {
                builder.append((long) d);
            } else {
                builder.append(Double.toString(d));
            }
            return;
        }
        builder.append(quote(JsValues.toJsString(value)));
    }

    private String quote(String value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ignored) {
            return "\"\"";
        }
    }

    private static String sha1Hex(String text) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-1");
            byte[] bytes = digest.digest(text.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder();
            for (byte b : bytes) {
                builder.append(String.format("%02x", b & 0xff));
            }
            return builder.toString();
        } catch (Exception ignored) {
            return "";
        }
    }

    // ==================================================================
    // 表情任务（9104-9150）
    // ==================================================================

    /** 等价 server.js 9104 的 lifeRepeatType。 */
    public String lifeRepeatType(Object raw, Object title) {
        String value = orEmpty(raw).trim().toLowerCase(Locale.ROOT);
        if ("once".equals(value)) {
            return "once";
        }
        if (LIFE_REPEAT_TYPES.contains(value)) {
            return value;
        }
        String text = str(title);
        if (LIFE_REPEAT_WEEKDAY_RE.matcher(text).find()) {
            return "weekday";
        }
        if (LIFE_REPEAT_DAILY_RE.matcher(text).find()) {
            return "daily";
        }
        if (LIFE_REPEAT_WEEKLY_RE.matcher(text).find()) {
            return "weekly";
        }
        if (LIFE_REPEAT_HABIT_RE.matcher(text).find()) {
            return "daily";
        }
        return "once";
    }

    // ==================================================================
    // 输出映射（9216-9370 / 9715-9719 / 9883-9982）
    // ==================================================================

    /** 等价 server.js 9216 的 lifeTaskOut。 */
    public Map<String, Object> lifeTaskOut(Map<String, Object> row) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", row.get("id"));
        out.put("date", orEmpty(row.get("task_date")));
        out.put("title", orEmpty(row.get("title")));
        out.put("estMinutes", numOr(row.get("est_minutes"), 0));
        String priority = orEmpty(row.get("priority"));
        out.put("priority", LIFE_TASK_PRIORITY.contains(priority) ? priority : "P1");
        String status = orEmpty(row.get("status"));
        out.put("status", LIFE_TASK_STATUS.contains(status) ? status : "todo");
        out.put("preTask", orEmpty(row.get("pre_task")));
        out.put("blocker", orEmpty(row.get("blocker")));
        out.put("support", orEmpty(row.get("support")));
        out.put("nodeId", orEmpty(row.get("node_id")));
        out.put("repeat", lifeRepeatType(row.get("repeat_type"), row.get("title")));
        out.put("sortOrder", numOr(row.get("sort_order"), 0));
        out.put("createdAt", numOr(row.get("created_at"), 0));
        out.put("updatedAt", numOr(row.get("updated_at"), 0));
        return out;
    }

    /** 等价 server.js 9236 的 lifeSnapshotOut。 */
    public Map<String, Object> lifeSnapshotOut(Map<String, Object> row) {
        Object payload = null;
        try {
            payload = JsValues.truthy(row.get("payload"))
                    ? objectMapper.readValue(JsValues.toJsString(row.get("payload")), Object.class) : null;
        } catch (Exception ignored) {
            payload = null;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", row.get("id"));
        out.put("date", orEmpty(row.get("snap_date")));
        out.put("progress", numOr(row.get("progress"), 0));
        out.put("payload", payload);
        out.put("diffNote", orEmpty(row.get("diff_note")));
        out.put("createdAt", numOr(row.get("created_at"), 0));
        return out;
    }

    /** 等价 server.js 9715 的 lifeSnapshotBrief。 */
    public Map<String, Object> lifeSnapshotBrief(Map<String, Object> row) {
        Map<String, Object> out = lifeSnapshotOut(row);
        Object payload = out.get("payload");
        // JS：out.payload = { ...out.payload, nodes: undefined } —— nodes 键在序列化时被丢弃
        if (payload instanceof Map<?, ?> map) {
            Map<String, Object> copy = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                String key = String.valueOf(entry.getKey());
                if (!"nodes".equals(key)) {
                    copy.put(key, entry.getValue());
                }
            }
            out.put("payload", copy);
        } else if (payload instanceof List<?> list) {
            Map<String, Object> copy = new LinkedHashMap<>();
            for (int i = 0; i < list.size(); i += 1) {
                copy.put(String.valueOf(i), list.get(i));
            }
            out.put("payload", copy);
        }
        return out;
    }

    /** 等价 server.js 9249 的 lifeEnergyOut。 */
    public Map<String, Object> lifeEnergyOut(Map<String, Object> row) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", row.get("id"));
        out.put("date", orEmpty(row.get("log_date")));
        out.put("plannedMinutes", numOr(row.get("planned_minutes"), 0));
        out.put("capacityMinutes", numOr(row.get("capacity_minutes"), 0));
        out.put("overload", numEquals(row.get("overload"), 1));
        out.put("distractions", orEmpty(row.get("distractions")));
        out.put("sleepHours", numOr(row.get("sleep_hours"), 0));
        out.put("health", orEmpty(row.get("health")));
        out.put("note", orEmpty(row.get("note")));
        out.put("createdAt", numOr(row.get("created_at"), 0));
        return out;
    }

    /** 等价 server.js 9264 的 lifeSkillOut。 */
    public Map<String, Object> lifeSkillOut(Map<String, Object> row) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", row.get("id"));
        String category = orEmpty(row.get("category"));
        out.put("category", LIFE_SKILL_CATEGORY.contains(category) ? category : "own");
        out.put("name", orEmpty(row.get("name")));
        out.put("level", orEmpty(row.get("level")));
        out.put("note", orEmpty(row.get("note")));
        out.put("sortOrder", numOr(row.get("sort_order"), 0));
        return out;
    }

    /** 等价 server.js 9275 的 lifeKnowledgeOut。 */
    public Map<String, Object> lifeKnowledgeOut(Map<String, Object> row) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", row.get("id"));
        out.put("subject", orEmpty(row.get("subject")));
        out.put("topic", orEmpty(row.get("topic")));
        out.put("content", orEmpty(row.get("content")));
        out.put("wrongQuestions", orEmpty(row.get("wrong_questions")));
        out.put("tags", orEmpty(row.get("tags")));
        out.put("reviewStage", numOr(row.get("review_stage"), 0));
        out.put("nextReviewDate", orEmpty(row.get("next_review_date")));
        out.put("source", JsValues.orDefault(row.get("source"), "ai"));
        out.put("createdAt", numOr(row.get("created_at"), 0));
        return out;
    }

    /** 等价 server.js 9290 的 lifeEventOut。 */
    public Map<String, Object> lifeEventOut(Map<String, Object> row) {
        Integer days = lifeDaysUntil(row.get("event_date"));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", row.get("id"));
        out.put("title", orEmpty(row.get("title")));
        out.put("date", orEmpty(row.get("event_date")));
        out.put("category", orEmpty(row.get("category")));
        String level = orEmpty(row.get("level"));
        out.put("level", (level.equals("high") || level.equals("mid") || level.equals("low")) ? level : "mid");
        out.put("remindDays", JsValues.orDefault(row.get("remind_days"), "30,7,1"));
        out.put("status", JsValues.orDefault(row.get("status"), "pending"));
        out.put("note", orEmpty(row.get("note")));
        out.put("daysLeft", days);
        return out;
    }

    /** 等价 server.js 9305 的 lifeChangeOut。 */
    public Map<String, Object> lifeChangeOut(Map<String, Object> row) {
        List<String> affected = new ArrayList<>();
        for (String part : orEmpty(row.get("affected")).split(",", -1)) {
            String trimmed = part.trim();
            if (!trimmed.isEmpty()) {
                affected.add(trimmed);
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", row.get("id"));
        out.put("module", orEmpty(row.get("module")));
        out.put("content", orEmpty(row.get("content")));
        out.put("reason", orEmpty(row.get("reason")));
        out.put("affected", affected);
        out.put("snapshotId", orEmpty(row.get("snapshot_id")));
        out.put("createdAt", numOr(row.get("created_at"), 0));
        return out;
    }

    /** 等价 server.js 9892 的 lifePersonaOut。 */
    public Map<String, Object> lifePersonaOut(Map<String, Object> row) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", row == null ? "" : orEmpty(row.get("id")));
        out.put("source", row == null ? "user" : JsValues.orDefault(row.get("source"), "user"));
        out.put("updatedAt", numOr(row == null ? null : row.get("updated_at"), 0));
        for (Map<String, Object> dim : LIFE_PERSONA_DIMS) {
            String col = str(dim.get("col"));
            out.put(str(dim.get("key")), str(row == null ? null : row.get(col)));
        }
        return out;
    }

    /** 等价 server.js 9964 的 lifePathOut。 */
    public Map<String, Object> lifePathOut(Map<String, Object> row) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", row.get("id"));
        out.put("name", orEmpty(row.get("name")));
        out.put("advantages", orEmpty(row.get("advantages")));
        out.put("risks", orEmpty(row.get("risks")));
        out.put("prerequisites", orEmpty(row.get("prerequisites")));
        out.put("evolution", orEmpty(row.get("evolution")));
        out.put("score", numOr(row.get("score"), 0));
        out.put("nodeId", orEmpty(row.get("node_id")));
        out.put("source", JsValues.orDefault(row.get("source"), "user"));
        out.put("sortOrder", numOr(row.get("sort_order"), 0));
        return out;
    }

    // ==================================================================
    // 检索（7393-7396 / 7606-7678）
    // ==================================================================

    /** 等价 server.js 7393 的 lifeUrlsIn。 */
    public List<String> lifeUrlsIn(Object textValue) {
        String raw = orEmpty(textValue == null ? "" : textValue);
        Matcher matcher = LIFE_URL_RE.matcher(raw);
        LinkedHashSet<String> set = new LinkedHashSet<>();
        while (matcher.find()) {
            String url = matcher.group();
            if (url.endsWith(".") || url.endsWith("。")) {
                url = url.substring(0, url.length() - 1);
            }
            set.add(url);
        }
        return new ArrayList<>(set);
    }

    /** 等价 server.js 7606 的 lifeQueryKey。 */
    public String lifeQueryKey(Object query) {
        String text = JsStrings.trim(orEmpty(query == null ? "" : query)).toLowerCase(Locale.ROOT);
        return sha1Hex(text);
    }

    /** 等价 server.js 7658 的 replaceResourcePlaceholder。 */
    public String replaceResourcePlaceholder(Object text, Object url) {
        String raw = orEmpty(text == null ? "" : text);
        if (raw.isEmpty() || !JsValues.truthy(url)) {
            return raw;
        }
        String link = str(url);
        String result = raw;
        Matcher label = LIFE_PLACEHOLDER_LABEL_RE.matcher(result);
        StringBuilder builder = new StringBuilder();
        while (label.find()) {
            label.appendReplacement(builder, Matcher.quoteReplacement(JsStrings.trim(label.group(1)) + "｜" + link));
        }
        label.appendTail(builder);
        result = builder.toString();

        result = LIFE_PLACEHOLDER_KW_RE.matcher(result).replaceAll(Matcher.quoteReplacement(link));
        result = LIFE_PLACEHOLDER_TBD_RE.matcher(result).replaceAll(Matcher.quoteReplacement(link));
        return result;
    }

    /** 等价 server.js 7672 的 pickBestResourceUrl。 */
    public String pickBestResourceUrl(Object results) {
        List<Map<String, Object>> list = new ArrayList<>();
        if (results instanceof List<?> raw) {
            for (Object item : raw) {
                if (item instanceof Map<?, ?> map) {
                    Map<String, Object> copy = new LinkedHashMap<>();
                    for (Map.Entry<?, ?> entry : map.entrySet()) {
                        copy.put(String.valueOf(entry.getKey()), entry.getValue());
                    }
                    String url = orEmpty(copy.get("url"));
                    if (LIFE_HTTP_RE.matcher(url).find()) {
                        list.add(copy);
                    }
                }
            }
        }
        if (list.isEmpty()) {
            return "";
        }
        Map<String, Object> official = null;
        Map<String, Object> media = null;
        for (Map<String, Object> item : list) {
            String url = str(item.get("url"));
            if (official == null && LIFE_OFFICIAL_URL_RE.matcher(url).find()) {
                official = item;
            }
            if (media == null && LIFE_MEDIA_URL_RE.matcher(url).find()) {
                media = item;
            }
        }
        Map<String, Object> chosen = official != null ? official : (media != null ? media : list.get(0));
        return trim(chosen.get("url"));
    }

    // ==================================================================
    // logLifePanelChange 的纯计算部分（9153-9160）
    // ==================================================================

    /** 等价 logLifePanelChange 里受影响模块串（入库存 lifeText 前的原值）。 */
    public String lifeAffectedModules(Object affectedModules) {
        if (affectedModules instanceof List<?> raw) {
            StringBuilder builder = new StringBuilder();
            boolean first = true;
            for (Object item : raw) {
                if (!JsValues.truthy(item)) {
                    continue;
                }
                if (!first) {
                    builder.append(',');
                }
                first = false;
                builder.append(JsValues.toJsString(item));
            }
            return builder.toString();
        }
        return orEmpty(affectedModules);
    }

    /** 等价 logLifePanelChange 里写入对话流的系统消息内容。 */
    public String lifePanelChangeContent(Object moduleName, Object content, String affected) {
        String affectedText = JsValues.truthy(affected) ? "，受影响模块：" + affected : "";
        return "【面板变更】" + lifeText(moduleName, 32) + "：" + lifeText(content, 400) + affectedText;
    }

    /**
     * logLifePanelChange 的纯计算部分（9153-9160）：把入库值与系统消息文本算好，
     * 交给 LifeQueryService 做两条 INSERT。返回键：id / module / content / reason / affected / snapshotId / createdAt / messageContent。
     */
    public Map<String, Object> logLifePanelChange(Object moduleName, Object content, Object reason,
                                                  Object affectedModules, long now) {
        String affected = lifeAffectedModules(affectedModules);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", Ids.uuid());
        out.put("module", lifeText(moduleName, 32));
        out.put("content", lifeText(content, 400));
        out.put("reason", lifeText(JsValues.truthy(reason) ? reason : "", 200));
        out.put("affected", lifeText(affected, 200));
        out.put("snapshotId", "");
        out.put("createdAt", now);
        out.put("messageContent", lifePanelChangeContent(moduleName, content, affected));
        return out;
    }

    // ==================================================================
    // 内部工具
    // ==================================================================

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> castList(List<?> raw) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object item : raw) {
            if (item instanceof Map<?, ?> map) {
                Map<String, Object> copy = new LinkedHashMap<>();
                for (Map.Entry<?, ?> entry : map.entrySet()) {
                    copy.put(String.valueOf(entry.getKey()), entry.getValue());
                }
                result.add(copy);
            }
        }
        return result;
    }

    private static List<Map<String, Object>> personaDerivedDims() {
        List<Map<String, Object>> list = new ArrayList<>();
        list.add(dim("state", "当前状态", "整体推进节奏与压力水位"));
        list.add(dim("abilities", "能力基线", "从已完成部分看已经具备的能力"));
        list.add(dim("habits", "行为习惯", "执行节奏、打卡稳定性、延期情况"));
        list.add(dim("traits", "性格特质", "从完成与放弃的取舍反推的倾向"));
        list.add(dim("resources", "资源盘点", "已掌握的资料、工具、渠道、证书"));
        list.add(dim("future", "未来可做的事", "按当前状态未来 1~3 年能承接的事"));
        list.add(dim("advantage", "相对优势", "做这些事时强在哪里、代价是什么"));
        return list;
    }

    private static Map<String, Object> dim(String key, String label, String hint) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("key", key);
        map.put("label", label);
        map.put("hint", hint);
        return map;
    }

    private static List<Map<String, Object>> personaDims() {
        List<Map<String, Object>> list = new ArrayList<>();
        list.add(personaDim("hardSkills", "hard_skills", "硬能力",
                "语言能力、专业技术、其他技能、证明材料、能力成长曲线（有客观依据、可量化）"));
        list.add(personaDim("timeHabits", "time_habits", "时间与行为习惯",
                "可用时段、任务履约特征、耐力指标、拖延模式、偏好（由打卡数据自动统计）"));
        list.add(personaDim("traits", "traits", "性格与心智特质",
                "风险偏好、目标倾向性、抗压能力、决策特点、执行力（由对话 + 行为客观推断）"));
        list.add(personaDim("resources", "resources", "资源",
                "资金状况、硬件资源、人脉资源、地域约束"));
        list.add(personaDim("valuesPref", "values_pref", "目标价值偏好",
                "优先级排序、取舍倾向、生活诉求"));
        list.add(personaDim("risks", "risks", "风险与短板",
                "薄弱能力项、行为短板、外部风险（预警用）"));
        return list;
    }

    private static Map<String, Object> personaDim(String key, String col, String label, String hint) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("key", key);
        map.put("col", col);
        map.put("label", label);
        map.put("hint", hint);
        return map;
    }
}
