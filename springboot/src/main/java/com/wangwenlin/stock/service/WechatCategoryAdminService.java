package com.wangwenlin.stock.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.common.JsStrings;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.mapper.WechatCategoryMapper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 分类反馈、分类规则管理（系统规则 / 学习规则 / 重新分类）。
 * 对齐 server.js 的 POST /api/wechat/category-feedback、GET /api/wechat/category-rules、
 * PUT /api/wechat/category-rules/system/:id、DELETE /api/wechat/category-rules/learned/:id、
 * POST /api/wechat/category-rules/system/reset、POST /api/wechat/category-rules/learned、POST /api/wechat/reclassify。
 */
@Service
public class WechatCategoryAdminService {

    private static final List<String> CATEGORIES = List.of("stock_pick", "market_news", "marketing");

    /** Node 端 category-rules/system/reset 的默认规则表（顺序、权重、文案需逐条一致）。 */
    private static final List<Object[]> DEFAULT_RULES = List.of(
            new Object[]{"marketing", "regex", "合作|加入|办一个|办理|会员|服务|咨询", 1, 3, "营销：合作/加入/办理等关键词"},
            new Object[]{"marketing", "regex", "元/(月|年|个月|季度|周期)", 1, 3, "营销：费用模式"},
            new Object[]{"marketing", "regex", "\\d{3,4}元", 1, 2, "营销：3-4位金额"},
            new Object[]{"marketing", "regex", "不是荐股|不构成投资建议|仅供.*参考", 1, 2, "营销：免责声明"},
            new Object[]{"marketing", "regex", "投资有风险.*入市须谨慎|入市有风险", 1, 2, "营销：风险提示"},
            new Object[]{"marketing", "regex", "老师|投顾|助理|客服|顾问", 1, 2, "营销：角色称谓"},
            new Object[]{"marketing", "regex", "添加|加微信|添加微信|扫码|二维码", 1, 2, "营销：联系方式"},
            new Object[]{"marketing", "regex", "名额|限量|限时|优惠|折扣|涨价", 1, 2, "营销：促销词汇"},
            new Object[]{"marketing", "regex", "回复.*数字|回复\\[\\d+\\]", 1, 2, "营销：回复指令"},
            new Object[]{"marketing", "keyword", "办一个", 1, 3, "营销关键词：办一个"},
            new Object[]{"marketing", "keyword", "518元", 1, 3, "营销关键词：518元"},
            new Object[]{"marketing", "keyword", "2980元", 1, 3, "营销关键词：2980元"},
            new Object[]{"marketing", "keyword", "课程", 1, 2, "营销关键词：课程"},
            new Object[]{"marketing", "keyword", "学员", 1, 2, "营销关键词：学员"},
            new Object[]{"marketing", "keyword", "直播回放", 1, 2, "营销关键词：直播回放"},
            new Object[]{"marketing", "keyword", "领取福利", 1, 2, "营销关键词：领取福利"},
            new Object[]{"marketing", "keyword", "新客户特惠", 1, 2, "营销关键词：新客户特惠"},
            new Object[]{"marketing", "keyword", "官方指导价", 1, 2, "营销关键词：官方指导价"},
            new Object[]{"stock_pick", "regex", "\\d{6}", 1, 2, "推票：6位股票代码"},
            new Object[]{"stock_pick", "regex", "【[^】]+\\s+\\d{6}\\s*】", 1, 3, "推票：【名称 代码】格式"},
            new Object[]{"stock_pick", "regex", "【[#⭕🔥]?\\s*[^】]{2,10}\\s*】", 1, 1, "推票：括号内股票名"},
            new Object[]{"stock_pick", "keyword", "涨停", 1, 2, "推票回顾：涨停"},
            new Object[]{"stock_pick", "keyword", "跌停", 1, 2, "推票回顾：跌停"},
            new Object[]{"stock_pick", "keyword", "T+1", 1, 2, "推票回顾：T+1"},
            new Object[]{"stock_pick", "keyword", "连板", 1, 2, "推票回顾：连板"},
            new Object[]{"stock_pick", "keyword", "封板", 1, 2, "推票回顾：封板"},
            new Object[]{"stock_pick", "keyword", "打板", 1, 2, "推票回顾：打板"},
            new Object[]{"stock_pick", "keyword", "强势涨停", 1, 2, "推票回顾：强势涨停"},
            new Object[]{"stock_pick", "keyword", "两连板", 1, 2, "推票回顾：两连板"},
            new Object[]{"stock_pick", "keyword", "2连板", 1, 2, "推票回顾：2连板"},
            new Object[]{"stock_pick", "keyword", "3连板", 1, 2, "推票回顾：3连板"},
            new Object[]{"stock_pick", "keyword", "累计涨", 1, 2, "推票回顾：累计涨"},
            new Object[]{"stock_pick", "keyword", "T+0", 1, 2, "推票回顾：T+0"},
            new Object[]{"stock_pick", "keyword", "今日早盘观察", 1, 2, "推票：今日早盘观察"},
            new Object[]{"stock_pick", "keyword", "短线优选", 1, 2, "推票：短线优选"},
            new Object[]{"stock_pick", "keyword", "每日推荐", 1, 2, "推票：每日推荐"},
            new Object[]{"stock_pick", "keyword", "每日掘金", 1, 2, "推票：每日掘金"},
            new Object[]{"stock_pick", "keyword", "票来了", 1, 2, "推票：票来了"},
            new Object[]{"market_news", "keyword", "放量", 1, 1, "行情：放量"},
            new Object[]{"market_news", "keyword", "反弹", 1, 1, "行情：反弹"},
            new Object[]{"market_news", "keyword", "量能", 1, 1, "行情：量能"},
            new Object[]{"market_news", "keyword", "板块", 1, 1, "行情：板块"},
            new Object[]{"market_news", "keyword", "大盘", 1, 1, "行情：大盘"},
            new Object[]{"market_news", "keyword", "走势", 1, 1, "行情：走势"},
            new Object[]{"market_news", "keyword", "趋势", 1, 1, "行情：趋势"},
            new Object[]{"market_news", "keyword", "主力", 1, 1, "行情：主力"},
            new Object[]{"market_news", "keyword", "资金流入", 1, 1, "行情：资金流入"},
            new Object[]{"market_news", "keyword", "资金流出", 1, 1, "行情：资金流出"},
            new Object[]{"market_news", "keyword", "拉升", 1, 1, "行情：拉升"},
            new Object[]{"market_news", "keyword", "洗盘", 1, 1, "行情：洗盘"},
            new Object[]{"market_news", "keyword", "早盘", 1, 1, "行情：早盘"},
            new Object[]{"market_news", "keyword", "尾盘", 1, 1, "行情：尾盘"},
            new Object[]{"market_news", "keyword", "震荡", 1, 1, "行情：震荡"},
            new Object[]{"market_news", "keyword", "回调", 1, 1, "行情：回调"},
            new Object[]{"market_news", "keyword", "突破", 1, 1, "行情：突破"},
            new Object[]{"market_news", "keyword", "回踩", 1, 1, "行情：回踩"},
            new Object[]{"market_news", "keyword", "企稳", 1, 1, "行情：企稳"},
            new Object[]{"market_news", "keyword", "反包", 1, 1, "行情：反包"},
            new Object[]{"market_news", "keyword", "沪指", 1, 1, "行情：沪指"},
            new Object[]{"market_news", "keyword", "深成指", 1, 1, "行情：深成指"},
            new Object[]{"market_news", "keyword", "创业板指", 1, 1, "行情：创业板指"},
            new Object[]{"market_news", "keyword", "北向资金", 1, 1, "行情：北向资金"},
            new Object[]{"market_news", "keyword", "融资融券", 1, 1, "行情：融资融券"},
            new Object[]{"market_news", "keyword", "集合竞价", 1, 1, "行情：集合竞价"},
            new Object[]{"market_news", "keyword", "牛股", 1, 1, "行情：牛股"},
            new Object[]{"market_news", "keyword", "妖股", 1, 1, "行情：妖股"},
            new Object[]{"market_news", "keyword", "龙头", 1, 1, "行情：龙头"},
            new Object[]{"market_news", "keyword", "热点", 1, 1, "行情：热点"},
            new Object[]{"market_news", "keyword", "题材", 1, 1, "行情：题材"}
    );

    private final WechatCategoryMapper mapper;
    private final WechatCategoryService categoryService;
    private final ObjectMapper objectMapper;

    public WechatCategoryAdminService(WechatCategoryMapper mapper,
                                      WechatCategoryService categoryService,
                                      ObjectMapper objectMapper) {
        this.mapper = mapper;
        this.categoryService = categoryService;
        this.objectMapper = objectMapper;
    }

    // ==================== POST /api/wechat/category-feedback ====================

    public Map<String, Object> categoryFeedback(Map<String, Object> body) throws Exception {
        Map<String, Object> b = body == null ? Map.of() : body;
        Object predictedCategoryRaw = b.containsKey("predictedCategory") ? b.get("predictedCategory") : "";
        if (!JsValues.truthy(predictedCategoryRaw)) {
            throw new ApiException(400, "predictedCategory 必填");
        }
        String predictedCategory = JsValues.toJsString(predictedCategoryRaw);
        Object userCorrectRaw = b.containsKey("userCorrect") ? b.get("userCorrect") : null;
        boolean userCorrectIsOne = userCorrectRaw instanceof Number one && one.doubleValue() == 1d;
        boolean userCorrectIsZero = userCorrectRaw instanceof Number zero && zero.doubleValue() == 0d;
        // 解构默认值仅对 undefined 生效：显式 null 原样写入库（Node 端 execute 同样传原始值）
        Object messageTextRaw = b.containsKey("messageText") ? b.get("messageText") : "";
        Object eventIdRaw = b.containsKey("eventId") ? b.get("eventId") : "";
        String messageText = JsValues.toJsString(messageTextRaw);
        String userCorrectedCategory = JsValues.toJsString(
                b.containsKey("userCorrectedCategory") ? b.get("userCorrectedCategory") : "");
        long now = System.currentTimeMillis();

        List<Map<String, Object>> learnedArr = new ArrayList<>();
        if (userCorrectIsZero || userCorrectIsOne) {
            Map<String, Object> learnedResult = categoryService.updateRulesFromFeedback(messageText, predictedCategory,
                    userCorrectIsOne ? 1 : 0, userCorrectIsZero ? userCorrectedCategory : "");
            Object learned = learnedResult.get("learned");
            if (learned instanceof List<?> list) {
                for (Object item : list) {
                    if (item instanceof Map<?, ?> map) {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> entry = (Map<String, Object>) map;
                        learnedArr.add(entry);
                    }
                }
            }
        }
        categoryService.invalidateLearningCaches();

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("eventId", eventIdRaw);
        data.put("messageText", messageTextRaw);
        data.put("predictedCategory", predictedCategory);
        data.put("userCorrect", userCorrectIsOne ? 1 : (userCorrectIsZero ? 0 : null));
        data.put("userCorrectedCategory", userCorrectedCategory);
        data.put("learnedKeywords", objectMapper.writeValueAsString(learnedArr));
        data.put("createdAt", now);
        mapper.insertFeedback(data);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("id", data.get("id"));
        result.put("rulesApplied", userCorrectIsZero || userCorrectIsOne);
        return result;
    }

    // ==================== GET /api/wechat/category-rules ====================

    public Map<String, Object> categoryRules(String categoryParam, String learnedLimit, String pageSizeParam,
                                             String learnedOffset, String offsetParam) {
        Map<String, Object> snapshot = categoryService.loadCategoryRulesSnapshot();
        String category = JsStrings.trim(categoryParam == null ? "" : categoryParam);

        // 等价 Node 端 Number.parseInt(raw, 10)：NaN（缺失/非法）回落默认 80，其余按 parseInt 截断
        String limitRaw = learnedLimit != null ? learnedLimit : pageSizeParam;
        Long requestedLimit = JsValues.parseIntOrNull(limitRaw);
        long limit = (long) Math.min(Math.max(requestedLimit == null ? 80d : requestedLimit.doubleValue(), 20d), 200d);

        String offsetRaw = learnedOffset != null ? learnedOffset : offsetParam;
        Long requestedOffset = JsValues.parseIntOrNull(offsetRaw);
        long offset = (long) Math.max(requestedOffset == null ? 0d : requestedOffset.doubleValue(), 0d);

        List<String> categories = new ArrayList<>(countsOf(snapshot).keySet());
        Map<String, Object> systemCounts = new LinkedHashMap<>();
        Map<String, Object> learnedCounts = new LinkedHashMap<>();
        for (String name : categories) {
            systemCounts.put(name, 0);
            learnedCounts.put(name, 0);
        }
        List<Map<String, Object>> systemSource = rulesOf(snapshot, "systemRules");
        List<Map<String, Object>> learnedSource = rulesOf(snapshot, "learnedRules");
        for (Map<String, Object> rule : systemSource) {
            Object ruleCategory = rule.get("category");
            if (JsValues.truthy(ruleCategory)) {
                String key = JsValues.toJsString(ruleCategory);
                systemCounts.put(key, countValue(systemCounts.get(key)) + 1);
            }
        }
        for (Map<String, Object> rule : learnedSource) {
            Object ruleCategory = rule.get("category");
            if (JsValues.truthy(ruleCategory)) {
                String key = JsValues.toJsString(ruleCategory);
                learnedCounts.put(key, countValue(learnedCounts.get(key)) + 1);
            }
        }

        List<Map<String, Object>> systemRules = category.isEmpty()
                ? new ArrayList<>(systemSource) : filterByCategory(systemSource, category);
        List<Map<String, Object>> learnedRules = new ArrayList<>();
        if (!category.isEmpty()) {
            List<Map<String, Object>> filtered = filterByCategory(learnedSource, category);
            learnedRules = slice(filtered, offset, offset + limit);
        } else {
            for (String name : categories) {
                List<Map<String, Object>> ofCategory = filterByCategory(learnedSource, name);
                learnedRules.addAll(slice(ofCategory, 0L, limit));
            }
        }

        Map<String, Object> loadedCounts = new LinkedHashMap<>();
        if (!category.isEmpty()) {
            loadedCounts.put(category, learnedRules.size() + offset);
        } else {
            for (String name : categories) {
                loadedCounts.put(name, Math.min(countValue(learnedCounts.get(name)), limit));
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("systemRules", systemRules);
        result.put("learnedRules", learnedRules);
        result.put("counts", snapshot.get("counts"));
        result.put("systemCounts", systemCounts);
        result.put("learnedCounts", learnedCounts);
        result.put("loadedCounts", loadedCounts);
        if (!category.isEmpty()) {
            result.put("hasMore", offset + learnedRules.size() < countValue(learnedCounts.get(category)));
        }
        result.put("cleanedCount", categoryService.getTotalCleanedRules());
        return result;
    }

    // ==================== PUT /api/wechat/category-rules/system/:id ====================

    public Map<String, Object> updateSystemRule(String id, Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        boolean hasEnabled = b.containsKey("enabled");
        boolean hasWeight = b.containsKey("weight");
        boolean hasDescription = b.containsKey("description");
        if (!hasEnabled && !hasWeight && !hasDescription) {
            return successTrue();
        }
        Integer enabled = hasEnabled ? (JsValues.truthy(b.get("enabled")) ? 1 : 0) : null;
        Double weight = hasWeight ? JsValues.parse(b.get("weight")) : null;
        // Node 端参数拼装为 [...values, Date.now()]：updated_at 拿到 id，WHERE 拿到时间戳（永不命中），此处原样复刻。
        mapper.updateSystemRule(hasEnabled, enabled, hasWeight, weight, hasDescription, b.get("description"),
                id, System.currentTimeMillis());
        categoryService.invalidateSystemRulesCache();
        return successTrue();
    }

    // ==================== DELETE /api/wechat/category-rules/learned/:id ====================

    public Map<String, Object> deleteLearnedRule(String id) {
        mapper.deleteLearnedRuleById(id);
        categoryService.invalidateLearningCaches();
        return successTrue();
    }

    // ==================== POST /api/wechat/category-rules/system/reset ====================

    public Map<String, Object> resetSystemRules() {
        mapper.deleteAllSystemRules();
        long now = System.currentTimeMillis();
        for (Object[] rule : DEFAULT_RULES) {
            mapper.insertSystemRule((String) rule[0], (String) rule[1], (String) rule[2],
                    (int) rule[3], (int) rule[4], (String) rule[5], now);
        }
        categoryService.invalidateSystemRulesCache();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("count", DEFAULT_RULES.size());
        return result;
    }

    // ==================== POST /api/wechat/category-rules/learned ====================

    public Map<String, Object> addLearnedRule(Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        Object categoryRaw = b.get("category");
        if (!(categoryRaw instanceof String category) || !CATEGORIES.contains(category)) {
            throw new ApiException(400, "category 无效");
        }
        Object keywordRaw = b.get("keyword");
        if (!JsValues.truthy(keywordRaw)) {
            throw new ApiException(400, "keyword 必填");
        }
        if (!(keywordRaw instanceof String keywordText)) {
            throw new IllegalStateException("keyword.trim is not a function");
        }
        String keyword = JsStrings.trim(keywordText);
        if (keyword.isEmpty()) {
            throw new ApiException(400, "keyword 必填");
        }
        Object weightRaw = b.containsKey("weight") ? b.get("weight") : 1;
        Double parsedWeight = JsValues.parse(weightRaw);
        double weight = parsedWeight == null || parsedWeight == 0d ? 1d : parsedWeight;
        long now = System.currentTimeMillis();
        mapper.upsertCustomLearnedRule(category, keyword, weight, now);
        categoryService.invalidateLearningCaches();
        return successTrue();
    }

    // ==================== POST /api/wechat/reclassify ====================

    public Map<String, Object> reclassify() {
        List<LinkedHashMap<String, Object>> rows = mapper.listEventsForReclassify();
        long recategorized = 0L;
        long skipped = 0L;
        List<Map<String, Object>> results = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            if (JsValues.truthy(row.get("is_manual"))) {
                skipped++;
                continue;
            }
            String text = row.get("message_text") == null ? null : String.valueOf(row.get("message_text"));
            String stocksJson = row.get("stocks_json") == null ? null : String.valueOf(row.get("stocks_json"));
            String newCategory = categoryService.categorizeMessageWithLearn(text, stocksJson);
            String oldCategory = row.get("category") == null ? null : String.valueOf(row.get("category"));
            if (!newCategory.equals(oldCategory)) {
                mapper.updateEventCategory(String.valueOf(row.get("id")), newCategory);
                recategorized++;
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("id", row.get("id"));
                entry.put("old", row.get("category"));
                entry.put("new", newCategory);
                results.add(entry);
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total", rows.size());
        result.put("recategorized", recategorized);
        result.put("skipped", skipped);
        result.put("results", results);
        return result;
    }

    // ==================== 内部工具 ====================

    private static Map<String, Object> successTrue() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        return result;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> countsOf(Map<String, Object> snapshot) {
        Object counts = snapshot.get("counts");
        return counts instanceof Map<?, ?> map ? (Map<String, Object>) map : new LinkedHashMap<>();
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> rulesOf(Map<String, Object> snapshot, String key) {
        Object value = snapshot.get(key);
        if (!(value instanceof List<?> list)) {
            return new ArrayList<>();
        }
        List<Map<String, Object>> rules = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> map) {
                rules.add((Map<String, Object>) map);
            }
        }
        return rules;
    }

    private static List<Map<String, Object>> filterByCategory(List<Map<String, Object>> source, String category) {
        List<Map<String, Object>> filtered = new ArrayList<>();
        for (Map<String, Object> rule : source) {
            if (category.equals(rule.get("category"))) {
                filtered.add(rule);
            }
        }
        return filtered;
    }

    private static List<Map<String, Object>> slice(List<Map<String, Object>> source, long from, long to) {
        int size = source.size();
        int start = (int) Math.min(Math.max(from, 0L), size);
        int end = (int) Math.min(Math.max(to, 0L), size);
        if (end <= start) {
            return new ArrayList<>();
        }
        return new ArrayList<>(source.subList(start, end));
    }

    private static long countValue(Object value) {
        return value instanceof Number number ? number.longValue() : 0L;
    }
}
