package com.wangwenlin.stock.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.mapper.WechatAiLogicMapper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * AI 推荐逻辑提取、训练样本保存与训练数据总览。
 * 对齐 server.js 的 POST /api/wechat/ai/extract-logic、POST /api/wechat/logic/train、GET /api/wechat/training-data。
 */
@Service
public class WechatAiLogicService {

    private static final Pattern FIRST_JSON_ARRAY = Pattern.compile("\\[[\\s\\S]*?\\]");
    private static final String LOGIC_MODEL = "agnes-2.0-flash";

    private final WechatAiLogicMapper mapper;
    private final AiCallService aiCallService;
    private final ObjectMapper objectMapper;

    public WechatAiLogicService(WechatAiLogicMapper mapper, AiCallService aiCallService, ObjectMapper objectMapper) {
        this.mapper = mapper;
        this.aiCallService = aiCallService;
        this.objectMapper = objectMapper;
    }

    // ==================== POST /api/wechat/ai/extract-logic ====================

    public Map<String, Object> extractLogic(Map<String, Object> body) {
        try {
            return doExtractLogic(body);
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            // 等价 Node 端外层 catch：降级返回空结果而非 500，避免前端控制台噪音
            Object stocks = body == null ? null : body.get("stocks");
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("results", stocks instanceof List<?> list ? degrade(list) : new ArrayList<>());
            return result;
        }
    }

    private Map<String, Object> doExtractLogic(Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        Object originalTextRaw = b.get("originalText");
        Object stocksRaw = b.get("stocks");
        if (!JsValues.truthy(originalTextRaw) || !(stocksRaw instanceof List<?> stockList) || stockList.isEmpty()) {
            throw new ApiException(400, "需要原文和股票列表");
        }
        String originalText = JsValues.toJsString(originalTextRaw);

        List<Object> validStocks = new ArrayList<>();
        for (Object stock : stockList) {
            if (stock instanceof Map<?, ?> map && JsValues.truthy(map.get("code"))) {
                validStocks.add(stock);
            }
        }

        if (validStocks.isEmpty()) {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("results", degrade(stockList));
            return result;
        }

        StringBuilder stockListText = new StringBuilder();
        for (Object stock : validStocks) {
            if (stockListText.length() > 0) {
                stockListText.append('、');
            }
            stockListText.append(textOf(stock, "name")).append('(').append(textOf(stock, "code")).append(')');
        }

        String systemPrompt = """
                你是一个股票推荐逻辑提取助手。你的任务是从一段文本中，为每只股票提取其对应的推荐逻辑/理由。

                要求：
                1. 从原文中提取每只股票对应的推荐逻辑，逻辑必须是原文中出现的短语或关键词的组合
                2. 如果原文中没有明确提到某只股票，则返回空字符串
                3. 输出JSON数组格式：[{"name": "股票名", "code": "代码", "logic": "提取的逻辑", "matched": true/false}]
                4. 推荐逻辑应简洁，提取原文中的关键短语，用"+"连接
                5. 只输出JSON数组，不要其他文字说明
                6. 如果某只股票找不到匹配的逻辑，logic设为空字符串，matched设为false""";
        String userPrompt = "原文：" + originalText + "\n\n需要提取的股票列表：" + stockListText
                + "\n\n请从原文中为每只股票提取对应的推荐逻辑。";

        List<Object> results = new ArrayList<>();
        try {
            String aiResult = aiCallService.callAI(systemPrompt, userPrompt, null, LOGIC_MODEL, 30000, 2000);
            if (aiResult != null && !aiResult.startsWith("⚠️")) {
                Matcher matcher = FIRST_JSON_ARRAY.matcher(aiResult);
                if (matcher.find()) {
                    results = parseArray(matcher.group());
                }
            }
        } catch (Exception ignored) {
            // AI 调用或解析失败时返回空结果，与 Node 端一致
        }

        if (results.isEmpty()) {
            List<Map<String, Object>> fallback = new ArrayList<>();
            for (Object stock : validStocks) {
                fallback.add(itemOf(stock, false));
            }
            results = new ArrayList<Object>(fallback);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("results", results);
        return result;
    }

    /** Node 端降级回包：{@code stocks.map(s => ({ name: s.name, code: s.code || '', logic: '', matched: false }))}。 */
    private List<Object> degrade(List<?> stockList) {
        List<Object> degraded = new ArrayList<>();
        for (Object stock : stockList) {
            if (!(stock instanceof Map<?, ?> map)) {
                throw new IllegalStateException("Cannot read properties of undefined (reading 'name')");
            }
            degraded.add(itemOf(map, true));
        }
        return degraded;
    }

    /**
     * 构造降级结果项。等价 JS 对象字面量：值为 undefined 的键在 JSON.stringify 时被丢弃，
     * 故仅当源对象确实存在 name 键时才输出，避免多出 "name": null。
     */
    private static Map<String, Object> itemOf(Object stock, boolean codeFallback) {
        Map<?, ?> map = stock instanceof Map<?, ?> source ? source : Map.of();
        Map<String, Object> item = new LinkedHashMap<>();
        if (map.containsKey("name")) {
            item.put("name", map.get("name"));
        }
        Object code = map.get("code");
        if (codeFallback) {
            item.put("code", JsValues.truthy(code) ? code : "");
        } else {
            item.put("code", code);
        }
        item.put("logic", "");
        item.put("matched", false);
        return item;
    }

    /** 等价 JS 模板字符串里的 {@code ${s.key}}：缺失键为 undefined，显式 null 为 null。 */
    private static String textOf(Object stock, String key) {
        if (stock instanceof Map<?, ?> map && map.containsKey(key)) {
            Object value = map.get(key);
            return value == null ? "null" : JsValues.toJsString(value);
        }
        return "undefined";
    }

    private List<Object> parseArray(String json) throws Exception {
        Object parsed = objectMapper.readValue(json, Object.class);
        if (parsed instanceof List<?> list) {
            return new ArrayList<>(list);
        }
        throw new IllegalStateException("JSON 结果不是数组");
    }

    // ==================== POST /api/wechat/logic/train ====================

    public Map<String, Object> trainLogic(Map<String, Object> body) throws Exception {
        Map<String, Object> b = body == null ? Map.of() : body;
        Object eventIdRaw = b.get("eventId");
        Object originalTextRaw = b.get("originalText");
        Object stocksRaw = b.get("stocks");
        if (!JsValues.truthy(eventIdRaw) || !JsValues.truthy(originalTextRaw) || !(stocksRaw instanceof List<?>)) {
            throw new ApiException(400, "参数不完整");
        }
        mapper.insertLogicTraining(JsValues.toJsString(eventIdRaw), JsValues.toJsString(originalTextRaw),
                objectMapper.writeValueAsString(stocksRaw),
                JsValues.truthy(b.get("sender")) ? JsValues.toJsString(b.get("sender")) : "",
                System.currentTimeMillis());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        return result;
    }

    // ==================== GET /api/wechat/training-data ====================

    public Map<String, Object> trainingData(String pageParam, String pageSizeParam) throws Exception {
        // 等价 Node 端 parseInt(req.query.page) || 默认值（非 Number，需按 parseInt 语义解析）
        Long parsedPage = JsValues.parseIntOrNull(pageParam);
        Long parsedPageSize = JsValues.parseIntOrNull(pageSizeParam);
        long page = Math.max(1L, parsedPage == null || parsedPage == 0L ? 1L : parsedPage);
        long rawPageSize = parsedPageSize == null || parsedPageSize == 0L ? 50L : parsedPageSize;
        long pageSize = Math.min(200L, Math.max(10L, rawPageSize));
        long offset = (page - 1L) * pageSize;

        List<Map<String, Object>> logicSamples = new ArrayList<>();
        for (Map<String, Object> row : mapper.listLogicSamples(pageSize, offset)) {
            Map<String, Object> item = new LinkedHashMap<>(row);
            Object stocksJson = row.get("stocks_json");
            item.put("stocks", JsValues.truthy(stocksJson)
                    ? objectMapper.readValue(String.valueOf(stocksJson), Object.class) : new ArrayList<>());
            logicSamples.add(item);
        }

        List<Map<String, Object>> feedbackSamples = new ArrayList<>();
        for (Map<String, Object> row : mapper.listFeedbackSamples(pageSize, offset)) {
            Map<String, Object> item = new LinkedHashMap<>(row);
            Object learned = row.get("learned_keywords");
            if (JsValues.truthy(learned)) {
                item.put("learned_keywords", learned instanceof String text
                        ? objectMapper.readValue(text, Object.class) : learned);
            } else {
                item.put("learned_keywords", new ArrayList<>());
            }
            feedbackSamples.add(item);
        }

        Map<String, Object> pagination = new LinkedHashMap<>();
        pagination.put("page", page);
        pagination.put("pageSize", pageSize);
        pagination.put("logicTotal", mapper.countLogicSamples());
        pagination.put("fbTotal", mapper.countFeedbackSamples());
        pagination.put("lrTotal", mapper.countLearnedRulesForTraining());
        pagination.put("srTotal", mapper.countSystemRulesForTraining());
        pagination.put("trTotal", mapper.countTracking());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("logicSamples", logicSamples);
        result.put("feedbackSamples", feedbackSamples);
        result.put("learnedRules", mapper.listLearnedRulesForTraining(pageSize, offset));
        result.put("systemRules", mapper.listSystemRulesForTraining(pageSize, offset));
        result.put("trackingData", mapper.listTrackingForTraining(pageSize, offset));
        result.put("pagination", pagination);
        return result;
    }
}
