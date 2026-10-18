package com.wangwenlin.stock.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.common.Ids;
import com.wangwenlin.stock.common.JsStrings;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.mapper.AiSettingsMapper;
import com.wangwenlin.stock.mapper.WechatEventMapper;
import com.wangwenlin.stock.mapper.WechatFilterMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 微信黑名单 / 白名单 / 会话跳过规则 / 白名单汇总 / 自定义行情分析。
 * 对齐 server.js 3458-3745、并复用 WechatCategoryService 的分类与营销判定。
 */
@Service
public class WechatFilterService {

    private static final Logger log = LoggerFactory.getLogger(WechatFilterService.class);

    private static final List<String> BLACKLIST_TYPES = List.of("sender", "chat_name", "keyword");
    private static final String DEFAULT_MARKET_MODEL = "agnes-2.0-flash";
    private static final Pattern RE_SIX_DIGITS = Pattern.compile("\\d{6}");
    private static final Pattern RE_BRACKETS = Pattern.compile("【([^】]{2,20})】");
    private static final Pattern RE_BRACKET_CLEAN = Pattern.compile("[【】\\s]");

    private final WechatFilterMapper filterMapper;
    private final WechatEventMapper eventMapper;
    private final WechatCategoryService categoryService;
    private final WechatExtractService extractService;
    private final AiSettingsMapper settingsMapper;
    private final AiCallService aiCallService;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public WechatFilterService(WechatFilterMapper filterMapper,
                               WechatEventMapper eventMapper,
                               WechatCategoryService categoryService,
                               WechatExtractService extractService,
                               AiSettingsMapper settingsMapper,
                               AiCallService aiCallService,
                               ObjectMapper objectMapper) {
        this.filterMapper = filterMapper;
        this.eventMapper = eventMapper;
        this.categoryService = categoryService;
        this.extractService = extractService;
        this.settingsMapper = settingsMapper;
        this.aiCallService = aiCallService;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    }

    // ==================== DELETE /api/wechat/db/clear ====================

    public Map<String, Object> clearDb() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cleared", eventMapper.deleteAll());
        return out;
    }

    // ==================== 黑名单 CRUD ====================

    public List<Map<String, Object>> listBlacklist() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : filterMapper.listBlacklist()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", row.get("id"));
            item.put("type", row.get("type"));
            item.put("value", row.get("value"));
            item.put("note", JsValues.orEmpty(row.get("note")));
            item.put("enabled", JsValues.truthy(row.get("enabled")));
            item.put("createdAt", row.get("created_at"));
            out.add(item);
        }
        return out;
    }

    public Map<String, Object> addBlacklist(Map<String, Object> body) {
        Map<String, Object> payload = body == null ? Map.of() : body;
        String value = JsStrings.trim(JsValues.toJsString(payload.get("value") == null ? "" : payload.get("value")));
        String rawType = payload.get("type") == null ? "" : JsValues.toJsString(payload.get("type"));
        String type = BLACKLIST_TYPES.contains(rawType) ? rawType : "keyword";
        if (value.isEmpty()) {
            throw new ApiException(400, "值不能为空");
        }
        String note = payload.containsKey("note") ? JsValues.toJsString(payload.get("note")) : "";
        String id = Ids.genId();
        long now = System.currentTimeMillis();

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", id);
        data.put("type", type);
        data.put("value", value);
        data.put("note", note);
        data.put("createdAt", now);
        filterMapper.insertBlacklist(data);
        extractService.clearBlacklistCache();

        List<Map<String, Object>> rows = filterMapper.findBlacklistByTypeValue(type, value);
        if (!rows.isEmpty() && rows.get(0) != null) {
            return rows.get(0);
        }
        Map<String, Object> fallback = new LinkedHashMap<>();
        fallback.put("id", id);
        fallback.put("type", type);
        fallback.put("value", value);
        return fallback;
    }

    public Map<String, Object> deleteBlacklist(String id) {
        filterMapper.deleteBlacklist(id);
        extractService.clearBlacklistCache();
        return ok();
    }

    public Map<String, Object> updateBlacklist(String id, Map<String, Object> body) {
        Map<String, Object> payload = body == null ? Map.of() : body;
        if (payload.containsKey("note")) {
            filterMapper.updateBlacklistNote(id, payload.get("note") == null ? null : JsValues.toJsString(payload.get("note")));
        }
        if (payload.containsKey("enabled")) {
            filterMapper.updateBlacklistEnabled(id, JsValues.truthy(payload.get("enabled")) ? 1 : 0);
        }
        extractService.clearBlacklistCache();
        return ok();
    }

    // ==================== GET /api/wechat/session-skip-rules ====================

    public Map<String, Object> sessionSkipRules() {
        List<Object> keywords = new ArrayList<>();
        List<Map<String, Object>> rules = new ArrayList<>();
        for (Map<String, Object> row : filterMapper.listSessionSkipRules()) {
            Object value = row.get("value");
            keywords.add(value);
            Map<String, Object> rule = new LinkedHashMap<>();
            rule.put("id", row.get("id"));
            rule.put("value", value);
            rule.put("note", row.get("note"));
            rule.put("enabled", JsValues.truthy(row.get("enabled")));
            rules.add(rule);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("keywords", keywords);
        out.put("rules", rules);
        return out;
    }

    // ==================== 白名单 CRUD ====================

    public List<Map<String, Object>> listWhitelist() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : filterMapper.listWhitelist()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", row.get("id"));
            item.put("nickname", row.get("nickname"));
            item.put("note", row.get("note"));
            item.put("enabled", JsValues.truthy(row.get("enabled")));
            item.put("createdAt", row.get("created_at"));
            out.add(item);
        }
        return out;
    }

    public Map<String, Object> addWhitelist(Map<String, Object> body) {
        Map<String, Object> payload = body == null ? Map.of() : body;
        String nickname = body == null ? "" : JsStrings.trim(JsValues.toJsString(
                payload.get("nickname") == null ? "" : payload.get("nickname")));
        if (nickname.isEmpty()) {
            throw new ApiException(400, "昵称不能为空");
        }
        String note = payload.containsKey("note") ? JsValues.toJsString(payload.get("note")) : "";
        String id = Ids.genId();

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", id);
        data.put("nickname", nickname);
        data.put("note", note);
        data.put("createdAt", System.currentTimeMillis());
        filterMapper.insertWhitelist(data);

        List<Map<String, Object>> rows = filterMapper.findWhitelistByNickname(nickname);
        if (rows.isEmpty() || rows.get(0) == null) {
            throw new IllegalStateException("Cannot read properties of undefined (reading 'id')");
        }
        Map<String, Object> row = rows.get(0);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", row.get("id"));
        out.put("nickname", row.get("nickname"));
        out.put("note", row.get("note"));
        out.put("enabled", JsValues.truthy(row.get("enabled")));
        return out;
    }

    public Map<String, Object> deleteWhitelist(String id) {
        filterMapper.deleteWhitelist(id);
        return ok();
    }

    public Map<String, Object> updateWhitelist(String id, Map<String, Object> body) {
        Map<String, Object> payload = body == null ? Map.of() : body;
        if (payload.containsKey("note")) {
            filterMapper.updateWhitelistNote(id, payload.get("note") == null ? null : JsValues.toJsString(payload.get("note")));
        }
        if (payload.containsKey("enabled")) {
            filterMapper.updateWhitelistEnabled(id, JsValues.truthy(payload.get("enabled")) ? 1 : 0);
        }
        return ok();
    }

    // ==================== POST /api/wechat/whitelist/summarize ====================

    public Map<String, Object> summarize(Map<String, Object> body) throws Exception {
        Map<String, Object> payload = body == null ? Map.of() : body;
        Object nicknameRaw = payload.get("nickname");
        double rawDays = JsValues.parseOrZero(payload.get("days"));
        double daysNum = Math.max(1d, Math.min(30d, rawDays == 0d ? 7d : rawDays));
        long since = System.currentTimeMillis() - (long) (daysNum * 86400000d);

        List<Map<String, Object>> rows;
        if (JsValues.truthy(nicknameRaw)) {
            rows = eventMapper.listBySenderSince(JsValues.toJsString(nicknameRaw), since);
        } else {
            List<String> names = new ArrayList<>();
            for (Map<String, Object> wl : filterMapper.listEnabledWhitelistNicknames()) {
                String name = wl.get("nickname") == null ? "" : JsValues.toJsString(wl.get("nickname"));
                if (!name.isEmpty()) {
                    names.add(name);
                } else {
                    names.add("");
                }
            }
            if (names.isEmpty()) {
                throw new ApiException(400, "白名单为空，请先添加昵称");
            }
            rows = eventMapper.listBySendersSince(new ArrayList<>(new LinkedHashSet<>(names)), since);
        }

        if (rows.isEmpty()) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("summary", "");
            out.put("totalMessages", 0);
            out.put("periodDays", jsNumber(daysNum));
            out.put("filteredOut", 0);
            return out;
        }

        // 智能过滤：分离行情分析消息和营销消息
        List<Map<String, Object>> marketRows = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            String text = row.get("message_text") == null ? "" : JsValues.toJsString(row.get("message_text"));
            if (!WechatCategoryService.isMarketingMessage(text)) {
                marketRows.add(row);
            }
        }
        int filteredOut = rows.size() - marketRows.size();

        // 如果指定了 category，进一步过滤
        Object categoryRaw = payload.get("category");
        String category = JsValues.truthy(categoryRaw) ? JsValues.toJsString(categoryRaw) : null;
        if (category != null && !"all".equals(category)) {
            int beforeCategoryFilter = marketRows.size();
            List<Map<String, Object>> filtered = new ArrayList<>();
            for (Map<String, Object> row : marketRows) {
                String text = row.get("message_text") == null ? "" : JsValues.toJsString(row.get("message_text"));
                String stocksJson = row.get("stocks_json") == null ? null : JsValues.toJsString(row.get("stocks_json"));
                if (category.equals(categoryService.categorizeMessage(text, stocksJson))) {
                    filtered.add(row);
                }
            }
            marketRows = filtered;
            filteredOut += beforeCategoryFilter - marketRows.size();
        }

        if (marketRows.isEmpty()) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("summary", category != null && !"all".equals(category)
                    ? "⚠️ 所选时间范围内没有" + ("stock_pick".equals(category) ? "推票" : "行情资讯") + "类消息。"
                    : "⚠️ 所选时间范围内的消息均为营销推广类内容，未检测到有价值的行情分析消息。");
            out.put("totalMessages", rows.size());
            out.put("filteredOut", filteredOut);
            out.put("periodDays", jsNumber(daysNum));
            out.put("sources", distinctSenders(rows));
            return out;
        }

        List<Map<String, Object>> messages = new ArrayList<>();
        for (Map<String, Object> row : marketRows) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("sender", row.get("sender"));
            item.put("time", row.get("created_at"));
            item.put("message", row.get("message_text"));
            item.put("stocks", stockTags(row.get("stocks_json")));
            messages.add(item);
        }

        String systemPrompt = "你是一个A股市场分析助手。请根据以下白名单用户在过去" + jsNumberText(daysNum) + "天内发送的消息，生成一份结构化分析报告，包含：\n"
                + "1. 【消息摘要】他们主要讨论了什么内容（2-3句话）\n"
                + "2. 【行情判断】对未来行情的看法（看涨/看跌/震荡，以及理由）\n"
                + "3. 【热门股票】统计提到最多的股票，列出前10只，包含代码和提及次数\n\n"
                + "输出使用markdown格式。严格基于提供的消息内容进行分析，不要编造信息。";
        String text = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(messages);
        String userPrompt = "以下是过去" + jsNumberText(daysNum) + "天白名单用户的行情分析类消息（已自动过滤营销推广内容）：\n\n"
                + text + "\n\n请生成分析报告。";

        String summary = aiCallService.callAI(systemPrompt, userPrompt, null, marketModel(), 60000, 2000);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("summary", summary);
        out.put("totalMessages", rows.size());
        out.put("analyzedMessages", marketRows.size());
        out.put("filteredOut", filteredOut);
        out.put("periodDays", jsNumber(daysNum));
        out.put("sources", distinctSenders(marketRows));
        return out;
    }

    // ==================== POST /api/wechat/ai/market-analysis ====================

    public Map<String, Object> marketAnalysis(Map<String, Object> body) throws Exception {
        Map<String, Object> payload = body == null ? Map.of() : body;
        Object eventsRaw = payload.get("events");
        if (!(eventsRaw instanceof List<?> pickedEvents) || pickedEvents.isEmpty()) {
            throw new ApiException(400, "请先选择至少一条消息");
        }
        double rawDays2 = JsValues.parseOrZero(payload.get("days"));
        double daysNum = Math.max(1d, Math.min(30d, rawDays2 == 0d ? 7d : rawDays2));

        // 从所选消息中提取关键词，用于联网搜索补充上下文
        Set<String> keywords = new LinkedHashSet<>();
        for (Object event : pickedEvents) {
            String text = eventText(event, "message");
            for (Matcher m = RE_SIX_DIGITS.matcher(text); m.find(); ) {
                keywords.add(m.group());
            }
            for (Matcher m = RE_BRACKETS.matcher(text); m.find(); ) {
                String name = RE_BRACKET_CLEAN.matcher(m.group(1)).replaceAll("").trim();
                name = RE_SIX_DIGITS.matcher(name).replaceAll("").trim();
                if (!name.isEmpty() && name.length() >= 2) {
                    keywords.add(name);
                }
            }
            String sender = eventText(event, "sender");
            if (!sender.isEmpty()) {
                keywords.add(sender);
            }
        }

        // 联网搜索（基于关键词，最多搜索5次）
        String searchContext = "";
        try {
            List<String> searchList = new ArrayList<>();
            for (String kw : keywords) {
                if (searchList.size() >= 5) break;
                searchList.add(kw);
            }
            List<String> allResults = new ArrayList<>();
            for (String kw : searchList) {
                if (kw == null || kw.length() < 2) continue;
                try {
                    String query = RE_SIX_DIGITS.matcher(kw).matches()
                            ? kw + " 股票 最新行情 分析"
                            : kw + " A股 最新行情 今日";
                    for (Map<String, Object> r : webSearchFn(query, 3)) {
                        String title = JsValues.orEmpty(r.get("title"));
                        String snippet = JsValues.orEmpty(r.get("snippet"));
                        if (!title.isEmpty() || !snippet.isEmpty()) {
                            allResults.add(("[搜索\"" + kw + "\"] " + title + "\n" + snippet).trim());
                        }
                    }
                } catch (Exception ignored) {
                    // 单次搜索失败不影响整体
                }
            }
            if (!allResults.isEmpty()) {
                searchContext = "\n\n========== 联网搜索补充信息（最近 " + jsNumberText(daysNum) + " 天相关）==========\n"
                        + String.join("\n------\n", allResults) + "\n====================";
            }
        } catch (Exception searchErr) {
            log.warn("[market-analysis] 联网搜索失败，使用本地消息: {}", searchErr.getMessage());
        }

        StringBuilder messagesBuilder = new StringBuilder();
        for (int i = 0; i < pickedEvents.size(); i++) {
            if (i > 0) {
                messagesBuilder.append("\n\n");
            }
            Object event = pickedEvents.get(i);
            String senderOrChat = eventText(event, "sender");
            if (senderOrChat.isEmpty()) {
                senderOrChat = eventText(event, "chatName");
            }
            if (senderOrChat.isEmpty()) {
                senderOrChat = "匿名";
            }
            String time = eventText(event, "time");
            StringBuilder one = new StringBuilder();
            one.append("--- 第").append(i + 1).append("条 [")
                    .append(WechatCategoryService.catLabel(eventText(event, "category"))).append("] ")
                    .append(senderOrChat).append(' ').append(time).append(" ---\n")
                    .append(eventText(event, "message"));
            List<String> stocks = eventStocks(event);
            if (!stocks.isEmpty()) {
                one.append("\n涉及股票: ").append(String.join("、", stocks));
            }
            messagesBuilder.append(one);
        }
        String messages = messagesBuilder.toString();

        List<String> first10 = new ArrayList<>();
        for (String kw : keywords) {
            if (first10.size() >= 10) break;
            first10.add(kw);
        }
        String kwList = String.join("、", first10);

        String systemPrompt = "你是一个专业的A股市场分析顾问，擅长结合消息面+基本面+技术面+市场情绪进行综合分析。\n\n"
                + "分析要求：\n"
                + "1. 先对用户选择的消息做结构化摘要：谁在什么时候说了什么、核心观点是什么\n"
                + "2. 提取消息中涉及的所有股票/板块/概念，分类列出来（推票类/行情类）\n"
                + "3. 结合联网搜索补充的实时公开数据，对消息中的股票/板块进行验证：近期走势、资金面、重要公告/新闻\n"
                + "4. 给出整体行情判断：短期情绪、方向（看涨/看跌/震荡）、理由\n"
                + "5. 给出风险提示和操作建议（保守/中性/激进）\n"
                + "6. 输出Markdown格式，分章节，条理清晰，不编造信息。搜索上下文仅供参考，不要当作消息发送者的原话。";
        String userPrompt = "以下是用户选择的微信消息（共" + pickedEvents.size() + "条，时间范围约最近" + jsNumberText(daysNum)
                + "天）：\n\n" + messages + searchContext + "\n\n"
                + (kwList.isEmpty() ? "" : "消息涉及关键词：" + kwList)
                + "\n\n请根据以上内容，结合联网搜索到的最新公开数据，生成一份详细的结构化A股行情分析报告。";

        String summary = aiCallService.callAI(systemPrompt, userPrompt, null, marketModel(), 120000, 4000);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("summary", summary);
        out.put("totalMessages", pickedEvents.size());
        out.put("searchedKeywords", new ArrayList<>(keywords));
        out.put("hasSearch", !searchContext.isEmpty());
        return out;
    }

    // ==================== 内部工具 ====================

    /** 等价 server.js 的 WebSearchFn：trae 搜索代理优先，回落 DuckDuckGo。 */
    private List<Map<String, Object>> webSearchFn(String query, int num) {
        List<Map<String, Object>> results = new ArrayList<>();
        if (query == null || query.isEmpty()) {
            return results;
        }
        try {
            try {
                String url = "https://trae-api-cn.mchost.guru/api/ide/v1/web_search?query="
                        + java.net.URLEncoder.encode(query, java.nio.charset.StandardCharsets.UTF_8)
                        + "&num=" + Math.min(10, num);
                HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                        .timeout(Duration.ofSeconds(10))
                        .header("Accept", "application/json")
                        .GET().build();
                HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
                if (response.statusCode() >= 200 && response.statusCode() < 300) {
                    Object parsed = objectMapper.readValue(response.body(), Object.class);
                    List<Object> arr = new ArrayList<>();
                    if (parsed instanceof List<?> list) {
                        arr.addAll(list);
                    } else if (parsed instanceof Map<?, ?> map) {
                        Object inner = map.get("results") != null ? map.get("results") : map.get("data");
                        if (inner instanceof List<?> list) arr.addAll(list);
                    }
                    for (Object item : arr) {
                        if (!(item instanceof Map<?, ?> r)) continue;
                        String title = JsValues.orEmpty(r.get("title"));
                        String snippet = JsValues.orEmpty(firstTruthy(r.get("snippet"), r.get("content"), r.get("desc")));
                        String link = JsValues.orEmpty(firstTruthy(r.get("url"), r.get("link")));
                        if (!title.isEmpty() || !snippet.isEmpty() || !JsValues.orEmpty(r.get("desc")).isEmpty()) {
                            Map<String, Object> one = new LinkedHashMap<>();
                            one.put("title", title);
                            one.put("snippet", snippet);
                            one.put("url", link);
                            results.add(one);
                        }
                    }
                    if (!results.isEmpty()) {
                        return results.subList(0, Math.min(num, results.size()));
                    }
                }
            } catch (Exception ignored) {
                // 方案1 失败继续方案2
            }

            try {
                String url = "https://api.duckduckgo.com/?q="
                        + java.net.URLEncoder.encode(query, java.nio.charset.StandardCharsets.UTF_8)
                        + "&format=json&no_html=1&skip_disambig=1";
                HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                        .timeout(Duration.ofSeconds(8))
                        .GET().build();
                HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
                if (response.statusCode() >= 200 && response.statusCode() < 300) {
                    Object parsed = objectMapper.readValue(response.body(), Object.class);
                    if (parsed instanceof Map<?, ?> data) {
                        String abstractText = JsValues.orEmpty(data.get("AbstractText"));
                        if (!abstractText.isEmpty()) {
                            Map<String, Object> one = new LinkedHashMap<>();
                            one.put("title", JsValues.orDefault(data.get("AbstractSource"), "DuckDuckGo"));
                            one.put("snippet", abstractText);
                            one.put("url", JsValues.orEmpty(data.get("AbstractURL")));
                            results.add(one);
                        }
                        if (data.get("RelatedTopics") instanceof List<?> topics) {
                            int taken = 0;
                            for (Object topic : topics) {
                                if (taken >= num) break;
                                if (topic instanceof Map<?, ?> t) {
                                    String text = JsValues.orEmpty(t.get("Text"));
                                    if (!text.isEmpty()) {
                                        Map<String, Object> one = new LinkedHashMap<>();
                                        one.put("title", JsValues.orEmpty(t.get("FirstURL")));
                                        one.put("snippet", text);
                                        one.put("url", JsValues.orEmpty(t.get("FirstURL")));
                                        results.add(one);
                                        taken++;
                                    }
                                }
                            }
                        }
                        if (!results.isEmpty()) {
                            return results.subList(0, Math.min(num, results.size()));
                        }
                    }
                }
            } catch (Exception ignored) {
                // 方案2 失败按空结果返回
            }
        } catch (Exception err) {
            log.warn("[WebSearchFn] 搜索失败: {}", err.getMessage());
        }
        return results;
    }

    /** 等价 JS 的 {@code e.key || ''}。 */
    private static String eventText(Object event, String key) {
        if (!(event instanceof Map<?, ?> map)) return "";
        return JsValues.orEmpty(map.get(key));
    }

    /** 等价 JS 的 {@code Array.isArray(e.stocks) ? e.stocks : []}。 */
    private static List<String> eventStocks(Object event) {
        List<String> out = new ArrayList<>();
        if (event instanceof Map<?, ?> map && map.get("stocks") instanceof List<?> list) {
            for (Object stock : list) {
                out.add(JsValues.toJsString(stock));
            }
        }
        return out;
    }

    /** 等价 server.js 3727 的 JSON.parse(stocks_json || '[]').map(s => s.name + ' ' + s.code)。 */
    private List<String> stockTags(Object stocksJson) throws Exception {
        if (!JsValues.truthy(stocksJson)) {
            return new ArrayList<>();
        }
        Object parsed = objectMapper.readValue(String.valueOf(stocksJson), Object.class);
        List<String> out = new ArrayList<>();
        if (parsed instanceof List<?> list) {
            for (Object item : list) {
                Map<?, ?> stock = item instanceof Map<?, ?> map ? map : Map.of();
                out.add(JsValues.toJsString(stock.get("name")) + " " + JsValues.toJsString(stock.get("code")));
            }
        }
        return out;
    }

    private static List<Object> distinctSenders(List<Map<String, Object>> rows) {
        Set<Object> seen = new LinkedHashSet<>();
        for (Map<String, Object> row : rows) {
            seen.add(row.get("sender"));
        }
        return new ArrayList<>(seen);
    }

    /** 等价 server.js 的 ai_model_routes.market || 'agnes-2.0-flash'。 */
    private String marketModel() {
        String raw = settingsMapper.valueOfKey("ai_model_routes");
        if (raw == null || raw.isEmpty()) {
            return DEFAULT_MARKET_MODEL;
        }
        try {
            Object parsed = objectMapper.readValue(raw, Object.class);
            if (parsed instanceof Map<?, ?> routes) {
                String market = JsValues.orEmpty(routes.get("market"));
                return market.isEmpty() ? DEFAULT_MARKET_MODEL : market;
            }
        } catch (Exception ignored) {
            // 路由配置异常时退回默认模型
        }
        return DEFAULT_MARKET_MODEL;
    }

    /** 数字保持 JS 写法：整数值不补 .0。 */
    private static Object jsNumber(double value) {
        if (value == Math.rint(value) && Math.abs(value) < 1e15) {
            return (long) value;
        }
        return value;
    }

    private static String jsNumberText(double value) {
        return JsValues.toJsString(jsNumber(value));
    }

    private static Object firstTruthy(Object... values) {
        for (Object value : values) {
            if (JsValues.truthy(value)) return value;
        }
        return null;
    }

    private static Map<String, Object> ok() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        return out;
    }
}
