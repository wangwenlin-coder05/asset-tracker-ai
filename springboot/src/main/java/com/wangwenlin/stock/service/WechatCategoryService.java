package com.wangwenlin.stock.service;

import com.wangwenlin.stock.common.JsStrings;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.mapper.AiSettingsMapper;
import com.wangwenlin.stock.mapper.WechatCategoryMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 微信消息分类 + 规则学习引擎。
 * <p>逐行对齐 server.js：{@code isMarketingMessage}(2023)、{@code loadSystemRules}(2076)、
 * {@code cleanupLearnedRules}(2114)、{@code getLearningProgressFactor}(2175)、
 * {@code isValidStockCode}(2245)、{@code extractValidStockCodes}(2292)、{@code categorizeMessage}(2304)、
 * {@code queryExtractLearn}(13076)、{@code normalizeLearningText}(13678)、{@code extractKeywords}(13683)、
 * {@code computeLearnedCategoryScores}(13702)、{@code loadFeedbackExamples}(13739)、
 * {@code computeFeedbackSimilarityScores}(13757)、{@code updateRulesFromFeedback}(13785)、
 * {@code loadCategoryRulesSnapshot}(13885)、{@code categorizeMessageWithLearn}(14125)。
 * <p>注意：Node 端 {@code _totalCleanedRules} 只在启动时从 ai_settings 读取，而启动期无租户上下文必失败，
 * 因此实际语义是「进程内从 0 开始累计」，此处保持一致（不做启动期加载）。
 */
@Service
public class WechatCategoryService {

    // ===================== 常量：营销/行情关键词 =====================

    private static final String[] MARKETING_KEYWORDS = {
        "办一个", "518元", "2980元", "合作后", "加入前", "加入后",
        "报喜", "学员", "回放课", "直播回放", "领取福利", "尾声福利",
        "办理链接", "优惠券", "新客户特惠", "官方指导价",
        "回复【", "回【", "回复8", "回复1", "回复2", "回复6",
        "少走很多弯路", "大胆尝试一次", "被套亏损严重",
        "特惠", "办一个试试", "试试吧", "也不贵",
        "给您申请", "课程", "教学软件",
    };

    private static final String[] MARKET_KEYWORDS = {
        "放量", "反弹", "量能", "涨停", "跌停", "板块", "科技股", "消费",
        "仓位", "短线", "超短", "快进快出", "行情", "大盘", "走势", "趋势",
        "支撑", "压力", "均线", "K线", "MACD", "布林", "创业板", "科创板",
        "沪深", "上证", "深证", "北证", "熔断", "跌停板", "涨停板",
        "主力", "资金流入", "资金流出", "北向资金", "融资融券",
        "洗盘", "出货", "吸筹", "拉升", "打压", "诱多", "诱空",
        "突破", "回踩", "企稳", "调整", "震荡", "反包", "打板",
        "早盘", "尾盘", "集合竞价", "盘后", "盘中",
        "牛市", "熊市", "猴市", "结构性行情",
    };

    private static final Pattern RE_SIX_DIGITS = Pattern.compile("\\d{6}");

    private static final List<Pattern> HARDCODED_MARKETING_STRONG = compileAll(
        "元/(月|年|个月|季度|周期)",
        "\\d{3,4}元",
        "添加|加微信|添加微信|扫码|二维码",
        "名额|限量|限时|优惠|折扣|涨价",
        "回复.*数字|回复\\[\\d+\\]",
        "新客户特惠|官方指导价|领取福利");

    private static final List<Pattern> HARDCODED_MARKETING_WEAK = compileAll(
        "合作|加入|办一个|办理|会员|服务",
        "老师|投顾|助理|客服|顾问");

    private static final List<Pattern> HARDCODED_MARKETING_DISCLAIMER = compileAll(
        "不是荐股|不构成投资建议|仅供.*参考",
        "投资有风险.*入市须谨慎|入市有风险");

    private static final String[] HARDCODED_MARKETING_KEYWORDS_STRONG = {
        "办一个", "518元", "2980元", "课程", "学员", "直播回放",
        "操作建议", "仅供参考",
    };

    private static final String[] HARDCODED_MARKETING_KEYWORDS_WEAK = {
        "风险提示", "不构成", "投资建议",
    };

    private static final List<Pattern> HARDCODED_NEWS_PATTERNS = compileAll(
        "大盘|走势|趋势|板块|行情|市场|指数|沪指|深成指|创业板指",
        "放量|反弹|回调|震荡|调整|突破|回踩|企稳|反包",
        "资金流入|资金流出|北向资金|融资融券|主力|机构",
        "早盘|尾盘|盘后|盘中|集合竞价",
        "牛股|妖股|龙头|热点|题材|概念");

    private static final String[] PICK_REVIEW_KEYWORDS = {
        "涨停", "跌停", "T+1", "T+0", "累计涨", "连板", "强势涨停", "两连板", "2连板",
        "3连板", "封板", "打板", "首板", "二板", "三板", "断板",
    };

    private static final Pattern RE_STOCK_NAME_IN_BRACKETS = Pattern.compile("【[#⭕🔥]?\\s*[^】]{2,10}\\s*】");

    private static final String[] RECOMMEND_KEYWORDS = {
        "关注", "低吸", "买入", "建仓", "加仓", "推荐", "目标价", "看涨", "看好", "机会",
        "潜力", "布局", "抄底", "上车", "埋伏",
    };

    private static final Pattern RE_STOCK_BRACKET = Pattern.compile("【[#⭕🔥\\s]*[^】]{2,10}[#⭕🔥\\s]*】");

    private static final String[] NEWS_OVERRIDE_KEYWORDS = {
        "大盘", "走势", "板块", "行情", "市场", "指数", "沪指", "深成指", "创业板指",
    };

    private static final String[] NEWS_FALLBACK_KEYWORDS = {
        "大盘", "走势", "板块", "行情", "放量", "反弹", "回调", "震荡", "突破", "回踩", "企稳",
    };

    private static final Pattern RE_BRACKET_CODE = Pattern.compile("【\\s*[^】]*?\\s+(\\d{6})\\s*】");
    private static final Pattern RE_VALID_CODE_IN_TEXT = Pattern.compile("(?:^|[^\\d])(\\d{6})(?:$|[^\\d])");
    private static final Pattern RE_ANY_DIGITS = Pattern.compile("\\d{6}");
    private static final Pattern RE_LEARN_CHUNK = Pattern.compile("[\\u4e00-\\u9fa5]{2,}|[a-z]{2,}");
    private static final Pattern RE_ONLY_LETTERS = Pattern.compile("^[a-z]+$");
    private static final Pattern RE_HAS_SIX_DIGIT_BOUNDED = Pattern.compile("(?:^|\\D)\\d{6}(?:\\D|$)");

    private static final Set<String> LEARNING_STOP_WORDS = new LinkedHashSet<>(List.of(
        "今天", "今日", "现在", "已经", "这个", "那个", "我们", "你们", "他们", "可以", "需要",
        "就是", "还是", "一个", "一下", "进行", "目前", "后续", "大家", "消息", "内容", "注意"));

    private static final List<String> CATEGORIES = List.of("stock_pick", "market_news", "marketing");

    /** 等价 server.js 3743 行 {@code _catLabel(cat)}。 */
    private static final Map<String, String> CATEGORY_LABEL_MAP = Map.of(
        "stock_pick", "推票消息",
        "market_news", "行情消息",
        "marketing", "营销消息",
        "refund", "退票消息",
        "other", "其他消息");

    // ===================== 依赖 =====================

    private final WechatCategoryMapper mapper;
    private final AiSettingsMapper aiSettingsMapper;
    private final JdbcTemplate jdbcTemplate;

    public WechatCategoryService(WechatCategoryMapper mapper, AiSettingsMapper aiSettingsMapper,
                                 JdbcTemplate jdbcTemplate) {
        this.mapper = mapper;
        this.aiSettingsMapper = aiSettingsMapper;
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * 等价 server.js 14428-14432：启动时从 ai_settings 读取历史累计清理数（走原生连接，不带租户条件），
     * 避免重启归零。Node 端用的是 raw pool 的全局读取，故此处用 JdbcTemplate 绕过租户拦截器。
     */
    @jakarta.annotation.PostConstruct
    void loadTotalCleanedRulesAtStartup() {
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT setting_value FROM ai_settings WHERE setting_key = ?", "total_cleaned_rules");
            if (!rows.isEmpty()) {
                Object raw = rows.get(0).get("setting_value");
                Long parsed = JsValues.parseIntOrNull(raw == null ? null : String.valueOf(raw));
                totalCleanedRules.set(Math.max(0L, parsed == null ? 0L : parsed));
            }
        } catch (Exception ignored) {
            // 等价 Node 端 try/catch 静默
        }
    }


    // ===================== 缓存状态 =====================

    /** Node 端快照 SELECT 的列序：MyBatis 的 Map 结果为 HashMap 会打乱键序，输出前需按此重排。 */
    private static final List<String> SYSTEM_RULE_COLUMNS = List.of(
            "id", "category", "rule_type", "pattern", "enabled", "weight", "description", "created_at", "updated_at");
    private static final List<String> LEARNED_RULE_COLUMNS = List.of(
            "id", "category", "keyword", "weight", "correct_count", "wrong_count", "created_at", "updated_at");
    private static final long SYSTEM_RULES_CACHE_TTL = 30000L;
    private static final long LEARNING_CACHE_TTL = 60000L;
    private static final long LEARNED_RULES_COUNT_TTL = 60000L;
    private static final int CLEANUP_THRESHOLD = 20;

    private volatile List<Map<String, Object>> systemRulesCache;
    private volatile long systemRulesCacheTime;
    private volatile List<Map<String, Object>> learnedRulesCache;
    private volatile long learnedRulesCacheTime;
    private volatile List<Map<String, Object>> feedbackExamplesCache;
    private volatile long feedbackExamplesCacheTime;
    private volatile Map<String, Object> categoryRulesSnapshotCache;
    private volatile long categoryRulesSnapshotCacheTime;
    private volatile Double learnedRulesCountCache;
    private volatile long learnedRulesCountCacheTime;

    private final AtomicInteger rulesAddedSinceCleanup = new AtomicInteger(0);
    private final AtomicLong totalCleanedRules = new AtomicLong(0);

    private final Map<String, Object> patternCache = new ConcurrentHashMap<>();

    // ===================== 工具 =====================

    /** 把 MyBatis 返回的（HashMap）行按 Node SELECT 列序重排为 LinkedHashMap，保证 JSON 键序一致。 */
    private static List<Map<String, Object>> reorderRows(List<Map<String, Object>> rows, List<String> columns) {
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Map<String, Object> row : rows) {
            Map<String, Object> ordered = new LinkedHashMap<>(columns.size());
            for (String column : columns) {
                if (row.containsKey(column)) {
                    ordered.put(column, row.get(column));
                }
            }
            out.add(ordered);
        }
        return out;
    }

    private static List<Pattern> compileAll(String... sources) {
        List<Pattern> list = new ArrayList<>(sources.length);
        for (String s : sources) {
            list.add(Pattern.compile(s));
        }
        return Collections.unmodifiableList(list);
    }

    private static double num(Object value) {
        if (value == null) {
            return Double.NaN;
        }
        if (value instanceof Number) {
            return ((Number) value).doubleValue();
        }
        try {
            return Double.parseDouble(String.valueOf(value));
        } catch (NumberFormatException e) {
            return Double.NaN;
        }
    }

    /** 等价 JS {@code Number(x) || 0}。 */
    private static double numOrZero(Object value) {
        double d = num(value);
        return Double.isNaN(d) ? 0d : d;
    }

    private static int intOrZero(Object value) {
        return (int) numOrZero(value);
    }

    /** 等价 JS 对 mysql TINYINT 值的真值判断：0 → false。 */
    private static boolean truthy(Object value) {
        if (value == null) {
            return false;
        }
        if (value instanceof Boolean b) {
            return b;
        }
        if (value instanceof Number n) {
            double d = n.doubleValue();
            return !(d == 0d || Double.isNaN(d));
        }
        String s = String.valueOf(value);
        return !(s.isEmpty() || "0".equals(s) || "false".equals(s));
    }

    private static String str(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private static String strOrEmpty(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    /** 等价 JS {@code text.includes(kw)}。 */
    private static boolean includes(String text, String kw) {
        return text != null && text.contains(kw);
    }

    private static String normalizeLowerTrim(String text) {
        String n = Normalizer.normalize(text, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT).trim();
        return n;
    }

    /** 等价 JS {@code String(text).normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/\s+/g,'')}。 */
    public static String normalizeLearningText(String text) {
        String s = text == null ? "" : text;
        return JsStrings.removeAllWhitespace(Normalizer.normalize(s, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT));
    }

    /** 缓存编译结果，避免同一条规则每次分类都重新编译正则以保持与 Node 完全一致的匹配语义。 */
    private Pattern compileCached(String source) {
        Object cached = patternCache.computeIfAbsent(source, key -> {
            try {
                return Pattern.compile(key);
            } catch (Exception e) {
                return Boolean.FALSE;
            }
        });
        return cached instanceof Pattern p ? p : null;
    }

    private static boolean findAny(Pattern pattern, String text) {
        return pattern != null && text != null && pattern.matcher(text).find();
    }

    // ===================== 营销判定 =====================

    /** 等价 server.js {@code isMarketingMessage(text)}：返回 true 表示应过滤掉。 */
    public static boolean isMarketingMessage(String text) {
        if (text == null || text.isEmpty()) {
            return true;
        }
        String t = JsStrings.removeAllWhitespace(text);

        int score = 0;
        for (String kw : MARKETING_KEYWORDS) {
            if (t.contains(kw)) {
                score -= 2;
            }
        }
        for (String kw : MARKET_KEYWORDS) {
            if (t.contains(kw)) {
                score += 3;
            }
        }
        int stockCount = 0;
        Matcher m = RE_SIX_DIGITS.matcher(t);
        while (m.find()) {
            stockCount++;
        }
        if (stockCount > 0) {
            score += 1;
        }

        boolean hasTestimonial = t.contains("案例为个别客户") || t.contains("历史收益") || t.contains("历史特定时间");
        if (hasTestimonial && score < 3) {
            return true;
        }
        return score < 0;
    }

    // ===================== 股票代码校验 =====================

    /** 等价 server.js {@code isValidStockCode(code, strict)}。 */
    public static boolean isValidStockCode(String code, boolean strict) {
        if (code == null) {
            return false;
        }
        String c = code.trim();
        if (!c.matches("\\d{6}")) {
            return false;
        }
        String prefix3 = c.substring(0, 3);
        String prefix2 = c.substring(0, 2);
        String prefix1 = c.substring(0, 1);

        if (isSubscriptionCode(c)) {
            return false;
        }
        if ("5".equals(prefix1)) {
            return false;
        }
        if ("15".equals(prefix2) || "16".equals(prefix2)) {
            return false;
        }
        if ("600".equals(prefix3) || "601".equals(prefix3) || "603".equals(prefix3) || "605".equals(prefix3)) {
            return true;
        }
        if ("68".equals(prefix2)) {
            return true;
        }
        if ("000".equals(prefix3) || "001".equals(prefix3) || "002".equals(prefix3)) {
            return true;
        }
        if ("30".equals(prefix2)) {
            return true;
        }
        if ("92".equals(prefix2) || "8".equals(prefix1)) {
            return true;
        }
        if ("900".equals(prefix3)) {
            return !strict;
        }
        if ("11".equals(prefix2) || "12".equals(prefix2)) {
            return !strict;
        }
        return false;
    }

    public static boolean isValidStockCode(String code) {
        return isValidStockCode(code, false);
    }

    /** 等价 server.js {@code isSubscriptionCode(code)}。 */
    public static boolean isSubscriptionCode(String code) {
        if (code == null) {
            return false;
        }
        String c = code.trim();
        if (!c.matches("\\d{6}")) {
            return false;
        }
        return "7".equals(c.substring(0, 1));
    }

    /**
     * 等价 server.js {@code extractValidStockCodes(text, strict)}：
     * 注意 JS 全局正则会吃掉边界字符，Java 侧用同样的 find 语义复刻。
     */
    public static List<String> extractValidStockCodes(String text, boolean strict) {
        if (text == null) {
            return List.of();
        }
        LinkedHashSet<String> codes = new LinkedHashSet<>();
        Matcher m = RE_VALID_CODE_IN_TEXT.matcher(text);
        while (m.find()) {
            String raw = m.group();
            String code = raw.replaceAll("[^\\d]", "");
            if (isValidStockCode(code, strict)) {
                codes.add(code);
            }
        }
        return new ArrayList<>(codes);
    }

    // ===================== 关键词抽取 =====================

    /** 等价 server.js {@code extractKeywords(text, minLen)}。 */
    public static List<String> extractKeywords(String text, int minLen) {
        if (text == null || text.isEmpty()) {
            return List.of();
        }
        LinkedHashSet<String> tokens = new LinkedHashSet<>();
        String normalized = Normalizer.normalize(text, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
        Matcher m = RE_LEARN_CHUNK.matcher(normalized);
        List<String> chunks = new ArrayList<>();
        while (m.find()) {
            chunks.add(m.group());
        }
        for (String chunk : chunks) {
            if (chunk.length() >= minLen && chunk.length() <= 16 && !LEARNING_STOP_WORDS.contains(chunk)) {
                tokens.add(chunk);
            }
            if (RE_ONLY_LETTERS.matcher(chunk).matches()) {
                continue;
            }
            int[] sizes = {2, 3, 4, 5};
            for (int size : sizes) {
                if (chunk.length() < size) {
                    continue;
                }
                for (int i = 0; i <= chunk.length() - size; i++) {
                    String token = chunk.substring(i, i + size);
                    if (!LEARNING_STOP_WORDS.contains(token)) {
                        tokens.add(token);
                    }
                }
            }
        }
        List<String> all = new ArrayList<>(tokens);
        return all.size() > 160 ? new ArrayList<>(all.subList(0, 160)) : all;
    }

    public static List<String> extractKeywords(String text) {
        return extractKeywords(text, 2);
    }

    // ===================== 缓存加载 =====================

    /** 等价 server.js {@code loadSystemRules()}。 */
    public List<Map<String, Object>> loadSystemRules() {
        long now = System.currentTimeMillis();
        List<Map<String, Object>> cached = systemRulesCache;
        if (cached != null && now - systemRulesCacheTime < SYSTEM_RULES_CACHE_TTL) {
            return cached;
        }
        try {
            List<Map<String, Object>> rows = mapper.listEnabledSystemRules();
            systemRulesCache = rows;
            systemRulesCacheTime = now;
            return rows;
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    /** 等价 server.js {@code loadLearnedRules()}。注意空数组在 Node 端同样会命中缓存。 */
    public List<Map<String, Object>> loadLearnedRules() {
        long now = System.currentTimeMillis();
        List<Map<String, Object>> cached = learnedRulesCache;
        if (cached != null && now - learnedRulesCacheTime < LEARNING_CACHE_TTL) {
            return cached;
        }
        List<Map<String, Object>> rows = reorderRows(mapper.listLearnedRules(), LEARNED_RULE_COLUMNS);
        learnedRulesCache = rows;
        learnedRulesCacheTime = now;
        return rows;
    }

    /** 等价 server.js {@code getLearningProgressFactor()}：0~10 条规则线性映射到 0~1。 */
    public double getLearningProgressFactor() {
        long now = System.currentTimeMillis();
        Double cached = learnedRulesCountCache;
        if (cached != null && now - learnedRulesCountCacheTime < LEARNED_RULES_COUNT_TTL) {
            return cached;
        }
        try {
            Map<String, Object> row = mapper.countLearnedRules();
            int count = row == null ? 0 : (int) numOrZero(row.get("cnt"));
            double factor = Math.min(1d, count / 10d);
            learnedRulesCountCache = factor;
            learnedRulesCountCacheTime = now;
            return factor;
        } catch (Exception e) {
            return 0d;
        }
    }

    /** 等价 server.js {@code loadFeedbackExamples()}。空数组同样命中缓存。 */
    public List<Map<String, Object>> loadFeedbackExamples() {
        long now = System.currentTimeMillis();
        List<Map<String, Object>> cached = feedbackExamplesCache;
        if (cached != null && now - feedbackExamplesCacheTime < LEARNING_CACHE_TTL) {
            return cached;
        }
        List<Map<String, Object>> rows = mapper.listFeedbackExamples();
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Object category = row.get("category");
            if (!CATEGORIES.contains(str(category))) {
                continue;
            }
            List<String> keywords = extractKeywords(strOrEmpty(row.get("message_text")));
            LinkedHashSet<String> features = new LinkedHashSet<>(
                keywords.size() > 120 ? keywords.subList(0, 120) : keywords);
            if (features.isEmpty()) {
                continue;
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("category", category);
            item.put("features", features);
            result.add(item);
        }
        feedbackExamplesCache = result;
        feedbackExamplesCacheTime = now;
        return result;
    }

    /** 等价 server.js {@code invalidateSystemRulesCache()}。 */
    public void invalidateSystemRulesCache() {
        systemRulesCache = null;
        systemRulesCacheTime = 0;
        categoryRulesSnapshotCache = null;
        categoryRulesSnapshotCacheTime = 0;
    }

    /** 等价 server.js {@code invalidateLearningCaches()}。 */
    public void invalidateLearningCaches() {
        learnedRulesCache = null;
        learnedRulesCacheTime = 0;
        feedbackExamplesCache = null;
        feedbackExamplesCacheTime = 0;
        categoryRulesSnapshotCache = null;
        categoryRulesSnapshotCacheTime = 0;
        learnedRulesCountCache = null;
        learnedRulesCountCacheTime = 0;
    }

    // ===================== 规则清理 =====================

    /** 等价 server.js {@code cleanupLearnedRules(force)}。 */
    public void cleanupLearnedRules(boolean force) {
        if (!force) {
            if (rulesAddedSinceCleanup.incrementAndGet() < CLEANUP_THRESHOLD) {
                return;
            }
            rulesAddedSinceCleanup.set(0);
        }
        try {
            int delNoise = mapper.deleteNoisyRules();
            int delBad = mapper.deleteLowAccuracyRules();
            int delEmpty = mapper.deleteEmptyRules();
            int capWeights = mapper.capPositiveWeights();
            int capWeightsNeg = mapper.capNegativeWeights();
            int totalDeleted = delNoise + delBad + delEmpty;
            int totalCapped = capWeights + capWeightsNeg;
            if (totalDeleted > 0 || totalCapped > 0) {
                long total = totalCleanedRules.addAndGet(totalDeleted);
                try {
                    aiSettingsMapper.upsert("total_cleaned_rules", String.valueOf(total), System.currentTimeMillis());
                } catch (Exception ignored) {
                    // 等价 Node 端 .catch(() => {})
                }
                invalidateLearningCaches();
            }
        } catch (Exception e) {
            // 等价 Node 端 console.error('[规则清理] 失败:', e.message)
        }
    }

    public long getTotalCleanedRules() {
        return totalCleanedRules.get();
    }

    // ===================== 分类主逻辑 =====================

    /** 等价 server.js {@code categorizeMessage(text, stocksJson)}。 */
    public String categorizeMessage(String text, String stocksJson) {
        try {
            if (text == null || text.isEmpty() || text.trim().isEmpty()) {
                return "market_news";
            }
            String cleanText = JsStrings.removeAllWhitespace(text);
            List<Map<String, Object>> rules = loadSystemRules();

            double learningFactor = getLearningProgressFactor();
            double hardcodeWeight = 1 - learningFactor * 0.5;

            Map<String, Double> categoryScores = new LinkedHashMap<>();
            categoryScores.put("stock_pick", 0d);
            categoryScores.put("market_news", 0d);
            categoryScores.put("marketing", 0d);

            // 1. stocksJson 中有有效股票代码 → 强推票信号
            try {
                List<Map<String, Object>> stocks = parseStocks(stocksJson);
                boolean hasValidStock = false;
                for (Map<String, Object> s : stocks) {
                    if (s != null && s.get("code") != null && isValidStockCode(String.valueOf(s.get("code")).trim())) {
                        hasValidStock = true;
                        break;
                    }
                }
                if (hasValidStock) {
                    categoryScores.merge("stock_pick", 6 * hardcodeWeight, Double::sum);
                }
            } catch (Exception ignored) {
                // 等价 Node 空 catch
            }

            // 2. 文本中【股票名 6位代码】格式
            int validBracketCodeCount = 0;
            Matcher bm = RE_BRACKET_CODE.matcher(text);
            while (bm.find()) {
                Matcher dm = RE_ANY_DIGITS.matcher(bm.group());
                if (dm.find() && isValidStockCode(dm.group())) {
                    validBracketCodeCount++;
                }
            }
            if (validBracketCodeCount > 0) {
                categoryScores.merge("stock_pick", 5 * hardcodeWeight, Double::sum);
            }

            // 3. 文本中包含6位有效A股代码
            List<String> validCodesInText = extractValidStockCodes(cleanText, false);
            if (!validCodesInText.isEmpty()) {
                categoryScores.merge("stock_pick", 4 * hardcodeWeight, Double::sum);
            }

            // 4. 推票回顾模式
            boolean hasPickReviewKeyword = anyContains(text, PICK_REVIEW_KEYWORDS);
            boolean stockNameInBrackets = RE_STOCK_NAME_IN_BRACKETS.matcher(text).find();
            if (hasPickReviewKeyword
                    && (stockNameInBrackets || !validCodesInText.isEmpty() || categoryScores.get("stock_pick") > 0)) {
                categoryScores.merge("stock_pick", 3 * hardcodeWeight, Double::sum);
            }

            // 5. 【股票名】 + 推荐关键词
            boolean hasRecommendKeyword = anyContains(text, RECOMMEND_KEYWORDS);
            if (stockNameInBrackets && hasRecommendKeyword) {
                categoryScores.merge("stock_pick", 3 * hardcodeWeight, Double::sum);
            }

            // 5. 基于系统规则打分
            boolean systemRuleMatched = false;
            if (!rules.isEmpty()) {
                for (Map<String, Object> rule : rules) {
                    if (!truthy(rule.get("enabled"))) {
                        continue;
                    }
                    boolean matched = false;
                    String ruleType = str(rule.get("rule_type"));
                    String pattern = str(rule.get("pattern"));
                    if ("regex".equals(ruleType)) {
                        Pattern compiled = compileCached(pattern == null ? "" : pattern);
                        if (compiled == null) {
                            continue;
                        }
                        matched = compiled.matcher(text).find();
                    } else if ("keyword".equals(ruleType)) {
                        matched = pattern != null && text.contains(pattern);
                    }
                    if (matched) {
                        String category = str(rule.get("category"));
                        if (categoryScores.containsKey(category)) {
                            categoryScores.merge(category, numOrZero(rule.get("weight")) * hardcodeWeight, Double::sum);
                        }
                        systemRuleMatched = true;
                    }
                }
            }
            // 硬编码兜底
            double hcW = 0.5 * hardcodeWeight;

            for (Pattern p : HARDCODED_MARKETING_STRONG) {
                if (findAny(p, text)) {
                    categoryScores.merge("marketing", 3 * hcW, Double::sum);
                }
            }
            for (Pattern p : HARDCODED_MARKETING_WEAK) {
                if (findAny(p, text)) {
                    categoryScores.merge("marketing", 1 * hcW, Double::sum);
                }
            }
            for (Pattern p : HARDCODED_MARKETING_DISCLAIMER) {
                if (findAny(p, text)) {
                    categoryScores.merge("marketing", 0.3 * hcW, Double::sum);
                }
            }
            for (String kw : HARDCODED_MARKETING_KEYWORDS_STRONG) {
                if (text.contains(kw)) {
                    categoryScores.merge("marketing", 1.5 * hcW, Double::sum);
                }
            }
            for (String kw : HARDCODED_MARKETING_KEYWORDS_WEAK) {
                if (text.contains(kw)) {
                    categoryScores.merge("marketing", 0.2 * hcW, Double::sum);
                }
            }
            for (Pattern p : HARDCODED_NEWS_PATTERNS) {
                if (findAny(p, text)) {
                    categoryScores.merge("market_news", 1.5 * hcW, Double::sum);
                }
            }

            boolean hasStockBracket = RE_STOCK_BRACKET.matcher(text).find();
            if (hasStockBracket && categoryScores.get("stock_pick") < 3) {
                categoryScores.merge("stock_pick", 1.5 * hcW, Double::sum);
            }

            boolean hasStockSignal = categoryScores.get("stock_pick") >= 3;
            double marketingThreshold = hasStockSignal ? 6 : 3;
            if (categoryScores.get("marketing") >= marketingThreshold
                    && categoryScores.get("marketing") >= categoryScores.get("market_news") + 2) {
                return "marketing";
            }

            if (categoryScores.get("stock_pick") >= 3) {
                return "stock_pick";
            }

            if (categoryScores.get("marketing") > 0
                    && categoryScores.get("marketing") >= categoryScores.get("market_news")) {
                return "marketing";
            }

            if (hasStockBracket && categoryScores.get("stock_pick") > 0) {
                boolean hasNewsOverride = anyContains(text, NEWS_OVERRIDE_KEYWORDS);
                if (!hasNewsOverride && categoryScores.get("marketing") < 3) {
                    return "stock_pick";
                }
            }

            // 返回得分最高的类别（等价 Object.entries.reduce，平局取先出现者）
            String maxCategory = null;
            double maxScore = 0;
            boolean first = true;
            for (Map.Entry<String, Double> entry : categoryScores.entrySet()) {
                if (first || entry.getValue() >= maxScore) {
                    maxCategory = entry.getKey();
                    maxScore = entry.getValue();
                    first = false;
                }
            }
            if (maxScore > 0 && maxCategory != null) {
                return maxCategory;
            }

            if (anyContains(text, NEWS_FALLBACK_KEYWORDS)) {
                return "market_news";
            }
            return "market_news";
        } catch (Exception err) {
            return "market_news";
        }
    }

    /** 等价 server.js {@code computeLearnedCategoryScores(text)}。 */
    public Map<String, Double> computeLearnedCategoryScores(String text) {
        Map<String, Double> scores = newScoreMap();
        try {
            List<Map<String, Object>> rows = loadLearnedRules();
            if (rows.isEmpty()) {
                return scores;
            }
            Set<String> features = new LinkedHashSet<>(extractKeywords(text));
            String normalizedText = normalizeLearningText(text);
            Map<String, Set<String>> positiveCategoriesByKeyword = new LinkedHashMap<>();
            for (Map<String, Object> rule : rows) {
                if (numOrZero(rule.get("weight")) <= 0) {
                    continue;
                }
                String keyword = str(rule.get("keyword"));
                positiveCategoriesByKeyword.computeIfAbsent(keyword, k -> new LinkedHashSet<>())
                    .add(str(rule.get("category")));
            }

            for (Map<String, Object> rule : rows) {
                String rawKeyword = str(rule.get("keyword"));
                String keyword = rawKeyword == null ? ""
                    : Normalizer.normalize(rawKeyword, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
                if (keyword.isEmpty()) {
                    continue;
                }
                boolean matched = features.contains(keyword)
                    || (keyword.length() >= 4 && normalizedText.contains(JsStrings.removeAllWhitespace(keyword)));
                if (!matched) {
                    continue;
                }
                int correct = intOrZero(rule.get("correct_count"));
                int wrong = intOrZero(rule.get("wrong_count"));
                double weight = Math.max(-10d, Math.min(10d, numOrZero(rule.get("weight"))));
                if (weight >= 0 && correct == 0) {
                    continue;
                }
                if (weight >= 0 && wrong > correct + 3) {
                    continue;
                }
                double reliability = (correct + 1d) / (correct + wrong + 2d);
                double support = 1 + (Math.log(correct + wrong + 2d) / Math.log(2)) * 0.18;
                double specificity = keyword.length() >= 5 ? 1.35
                    : keyword.length() == 4 ? 1.1
                    : keyword.length() == 3 ? 0.78 : 0.5;
                Set<String> positive = positiveCategoriesByKeyword.get(rawKeyword);
                int ambiguity = positive == null ? 1 : positive.size();
                double ambiguityFactor = ambiguity > 1 ? 0.45 : 1;
                String category = str(rule.get("category"));
                if (scores.containsKey(category)) {
                    scores.merge(category,
                        weight * reliability * support * specificity * ambiguityFactor, Double::sum);
                }
            }
        } catch (Exception err) {
            // 等价 Node 端 console.error('[分类学习] 规则评分失败:', err.message)
        }
        return scores;
    }

    /** 等价 server.js {@code computeFeedbackSimilarityScores(text)}。 */
    public Map<String, Double> computeFeedbackSimilarityScores(String text) {
        Map<String, Double> scores = newScoreMap();
        try {
            List<String> keywordList = extractKeywords(text);
            Set<String> target = new LinkedHashSet<>(
                keywordList.size() > 120 ? keywordList.subList(0, 120) : keywordList);
            if (target.isEmpty()) {
                return scores;
            }
            List<Map<String, Object>> examples = loadFeedbackExamples();
            Map<String, List<Double>> matches = new LinkedHashMap<>();
            for (String category : CATEGORIES) {
                matches.put(category, new ArrayList<>());
            }
            for (Map<String, Object> example : examples) {
                @SuppressWarnings("unchecked")
                Set<String> exampleFeatures = (Set<String>) example.get("features");
                int intersection = 0;
                for (String feature : target) {
                    if (exampleFeatures.contains(feature)) {
                        intersection++;
                    }
                }
                if (intersection == 0) {
                    continue;
                }
                double coverage = intersection / (double) Math.min(target.size(), exampleFeatures.size());
                double jaccard = intersection / (double) (target.size() + exampleFeatures.size() - intersection);
                double similarity = coverage * 0.72 + jaccard * 0.28;
                if (similarity >= 0.16) {
                    List<Double> bucket = matches.get(str(example.get("category")));
                    if (bucket != null) {
                        bucket.add(similarity);
                    }
                }
            }
            for (String category : matches.keySet()) {
                List<Double> bucket = new ArrayList<>(matches.get(category));
                bucket.sort((a, b) -> Double.compare(b, a));
                if (bucket.size() > 8) {
                    bucket = new ArrayList<>(bucket.subList(0, 8));
                }
                double repetitionBoost = 1 + (Math.log(bucket.size() + 1d) / Math.log(2)) * 0.18;
                double sum = 0;
                for (double value : bucket) {
                    sum += value * value * 4;
                }
                scores.put(category, sum * repetitionBoost);
            }
        } catch (Exception err) {
            // 等价 Node 端 console.error('[分类学习] 相似样本评分失败:', err.message)
        }
        return scores;
    }

    /** 等价 server.js {@code updateRulesFromFeedback(...)}，返回 {@code {learned:[...]}}。 */
    public Map<String, Object> updateRulesFromFeedback(String messageText, String predictedCategory,
                                                       Integer userCorrect, String userCorrectedCategory) {
        Map<String, Object> result = new LinkedHashMap<>();
        List<Map<String, Object>> learned = new ArrayList<>();
        result.put("learned", learned);
        if (messageText == null || messageText.isEmpty()) {
            return result;
        }
        long now = System.currentTimeMillis();
        List<String> keywords = extractKeywords(messageText);
        if (keywords.isEmpty()) {
            return result;
        }

        List<Object[]> updates = new ArrayList<>();
        for (String kw : keywords) {
            if (userCorrect != null && userCorrect == 1) {
                updates.add(new Object[]{predictedCategory, kw, 1, 1, 0});
                learned.add(learnEntry(kw, predictedCategory, "strengthen", 1, "强化正确"));
            } else if (userCorrect != null && userCorrect == 0) {
                updates.add(new Object[]{predictedCategory, kw, -1, 0, 1});
                learned.add(learnEntry(kw, predictedCategory, "weaken", -1, "削弱错误"));
                if (userCorrectedCategory != null && !userCorrectedCategory.isEmpty()
                        && !userCorrectedCategory.equals(predictedCategory)) {
                    updates.add(new Object[]{userCorrectedCategory, kw, 2, 1, 0});
                    learned.add(learnEntry(kw, userCorrectedCategory, "strengthen", 2, "强化修正"));
                }
            }
        }

        try {
            for (Object[] row : updates) {
                mapper.upsertCategoryRule(str(row[0]), str(row[1]), (int) row[2], (int) row[3], (int) row[4], now);
            }
            mapper.capPositiveWeights();
            mapper.capNegativeWeights();
            invalidateLearningCaches();
            cleanupLearnedRules(false);
            return result;
        } catch (Exception e) {
            return result;
        }
    }

    private static Map<String, Object> learnEntry(String keyword, String category, String action, int delta, String label) {
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("keyword", keyword);
        entry.put("category", category);
        entry.put("action", action);
        entry.put("delta", delta);
        entry.put("label", label);
        return entry;
    }

    /** 等价 server.js {@code loadCategoryRulesSnapshot()}。 */
    public Map<String, Object> loadCategoryRulesSnapshot() {
        long now = System.currentTimeMillis();
        Map<String, Object> cached = categoryRulesSnapshotCache;
        if (cached != null && now - categoryRulesSnapshotCacheTime < LEARNING_CACHE_TTL) {
            return cached;
        }
        List<Map<String, Object>> systemRules = reorderRows(mapper.listSystemRules(), SYSTEM_RULE_COLUMNS);
        List<Map<String, Object>> learnedRules = loadLearnedRules();
        Map<String, Object> counts = new LinkedHashMap<>();
        for (String category : CATEGORIES) {
            counts.put(category, 0);
        }
        List<Map<String, Object>> combined = new ArrayList<>(systemRules);
        combined.addAll(learnedRules);
        for (Map<String, Object> rule : combined) {
            String category = str(rule.get("category"));
            if (category != null && counts.containsKey(category)) {
                counts.put(category, (int) numOrZero(counts.get(category)) + 1);
            }
        }
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("systemRules", systemRules);
        snapshot.put("learnedRules", learnedRules);
        snapshot.put("counts", counts);
        snapshot.put("cleanedCount", totalCleanedRules.get());
        categoryRulesSnapshotCache = snapshot;
        categoryRulesSnapshotCacheTime = now;
        return snapshot;
    }

    /** 等价 server.js {@code queryExtractLearn(text)}：未命中返回 null。 */
    public Map<String, Object> queryExtractLearn(String text) {
        try {
            if (text == null || text.trim().isEmpty()) {
                return null;
            }
            String q = text.trim();
            if (q.length() > 2000) {
                q = q.substring(0, 2000);
            }
            return mapper.queryExtractLearn(q);
        } catch (Exception err) {
            return null;
        }
    }

    /** 等价 server.js {@code categorizeMessageWithLearn(text, stocksJson, memHit)}。 */
    public String categorizeMessageWithLearn(String text, String stocksJson) {
        return categorizeMessageWithLearn(text, stocksJson, null);
    }

    public String categorizeMessageWithLearn(String text, String stocksJson, Map<String, Object> memHit) {
        Map<String, Object> hit = memHit;
        if (hit == null) {
            hit = queryExtractLearn(text);
        }
        if (hit != null && CATEGORIES.contains(str(hit.get("correct_label")))) {
            return str(hit.get("correct_label"));
        }

        String base = "market_news";
        try {
            base = categorizeMessage(text, stocksJson);
        } catch (Exception e) {
            base = "market_news";
        }
        if (text == null || text.isEmpty()) {
            return base;
        }
        if (!CATEGORIES.contains(base)) {
            base = "market_news";
        }

        try {
            List<Map<String, Object>> stocks = parseStocks(stocksJson);
            boolean hasValidStock = false;
            for (Map<String, Object> s : stocks) {
                if (s != null && s.get("code") != null && String.valueOf(s.get("code")).trim().matches("\\d{6}")) {
                    hasValidStock = true;
                    break;
                }
            }
            if (hasValidStock && "stock_pick".equals(base)) {
                return "stock_pick";
            }
        } catch (Exception ignored) {
            // 等价 Node 空 catch
        }

        Map<String, Double> ruleScores = computeLearnedCategoryScores(text);
        Map<String, Double> similarityScores = computeFeedbackSimilarityScores(text);
        Map<String, Double> combined = newScoreMap();
        for (String category : CATEGORIES) {
            combined.put(category,
                numOrZero(ruleScores.get(category)) + numOrZero(similarityScores.get(category)));
        }

        boolean hasValidStock = false;
        try {
            List<Map<String, Object>> stocks = parseStocks(stocksJson);
            for (Map<String, Object> stock : stocks) {
                String code = stock == null || stock.get("code") == null ? "" : String.valueOf(stock.get("code"));
                if (code.trim().matches("\\d{6}")) {
                    hasValidStock = true;
                    break;
                }
            }
        } catch (Exception ignored) {
            // 等价 Node 空 catch
        }
        if (!hasValidStock) {
            hasValidStock = RE_HAS_SIX_DIGIT_BOUNDED.matcher(String.valueOf(text)).find();
        }

        combined.merge(base, (hasValidStock && "stock_pick".equals(base)) ? 6d : 1.35d, Double::sum);
        List<String> ranked = new ArrayList<>(CATEGORIES);
        ranked.sort((a, b) -> {
            int cmp = Double.compare(combined.get(b), combined.get(a));
            return cmp != 0 ? cmp : Integer.compare(CATEGORIES.indexOf(a), CATEGORIES.indexOf(b));
        });
        String winner = ranked.get(0);
        if (winner.equals(base)) {
            return base;
        }

        double learnedEvidence = numOrZero(ruleScores.get(winner)) + numOrZero(similarityScores.get(winner));
        double margin = combined.get(winner) - combined.get(base);
        double requiredEvidence = hasValidStock ? 5.5 : 1.8;
        double requiredMargin = hasValidStock ? 2.5 : 0.8;
        if (learnedEvidence >= requiredEvidence && margin >= requiredMargin) {
            return winner;
        }
        return base;
    }

    // ===================== 杂项 =====================

    private static Map<String, Double> newScoreMap() {
        Map<String, Double> scores = new LinkedHashMap<>();
        scores.put("stock_pick", 0d);
        scores.put("market_news", 0d);
        scores.put("marketing", 0d);
        return scores;
    }

    /** 等价 server.js 3743 行 {@code _catLabel(cat)}。 */
    public static String catLabel(String cat) {
        String label = CATEGORY_LABEL_MAP.get(cat);
        if (label != null) {
            return label;
        }
        return cat == null || cat.isEmpty() ? "未知" : cat;
    }

    private static final com.fasterxml.jackson.databind.ObjectMapper JSON = new com.fasterxml.jackson.databind.ObjectMapper();

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> parseStocks(String stocksJson) throws Exception {
        if (stocksJson == null || stocksJson.isEmpty()) {
            return List.of();
        }
        Object parsed = JSON.readValue(stocksJson, Object.class);
        List<Map<String, Object>> list = new ArrayList<>();
        if (parsed instanceof List<?> arr) {
            for (Object item : arr) {
                if (item instanceof Map<?, ?> m) {
                    list.add((Map<String, Object>) m);
                } else {
                    list.add(null);
                }
            }
        }
        return list;
    }

    private static boolean anyContains(String text, String[] keywords) {
        for (String kw : keywords) {
            if (text.contains(kw)) {
                return true;
            }
        }
        return false;
    }
}
