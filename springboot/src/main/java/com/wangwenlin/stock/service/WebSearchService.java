package com.wangwenlin.stock.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wangwenlin.stock.common.JsStrings;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.common.Utf8Js;
import com.wangwenlin.stock.config.AppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.InputStream;
import java.net.URI;
import java.net.URLDecoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 联网检索引擎 —— 逐行等价迁移 backend/web-search.js。
 *
 * <p>顺序自动降级的 8 个 provider（秘塔 / SearXNG / Bing / 豆包 / Claw / OpenSERP / DuckDuckGo / Tavily），
 * 财经类查询走 AKShare 单独分支；公共约束：原生 Http、查询缓存、熔断、8 秒超时、结果合并去重、单会话 12 次上限。
 * 降级链顺序委托 {@link SearchSourceService}，本类不另存一份状态。
 */
@Service
public class WebSearchService {

    private static final Logger log = LoggerFactory.getLogger(WebSearchService.class);

    // ===== 常量（对齐 backend/web-search.js 取值与默认值）=====
    private static final int RESULT_LIMIT = intEnv("SEARCH_RESULT_LIMIT", 24);
    private static final int SNIPPET_MAX = 600;
    private static final long TIMEOUT_MS = 8000;
    private static final long CACHE_TTL = 24L * 60 * 60 * 1000;
    private static final int CACHE_MAX = 400;
    private static final int BREAKER_THRESHOLD = 3;
    private static final long BREAKER_COOLDOWN = 10L * 60 * 1000;
    private static final int SESSION_LIMIT = intEnv("SEARCH_SESSION_LIMIT", 12);
    private static final long SESSION_WINDOW = 30L * 60 * 1000;
    private static final long DDG_MIN_INTERVAL = 3000;
    private static final long BING_MIN_INTERVAL = 1200;
    private static final long CLAW_MIN_INTERVAL = 700;
    private static final long SEARXNG_MIN_INTERVAL = 1500;
    private static final long AKSHARE_TIMEOUT = 60000;

    private static final String SEARXNG_URL = envOr("SEARXNG_URL", "http://localhost:8080");
    private static final String OPENSERP_URL = envOr("OPENSERP_URL", "http://localhost:7000");
    private static final String CLAW_URL = envOr("CLAW_SEARCH_URL", "https://www.claw-search.com");

    private static final int CONTEXT_LIMIT = intEnv("SEARCH_CONTEXT_LIMIT", 8);

    /** 需要密钥的搜索源 → 其密钥字段名（密钥按租户加密存储在 ai_settings）。 */
    private static final Map<String, String> KEY_FIELDS = Map.of(
            "metaso", "metaso_api_key",
            "volcengine", "volcengine_api_key",
            "tavily", "tavily_api_key");

    // ===== 工具正则 =====
    private static final Pattern WHITESPACE_RUN = Pattern.compile("\\s+");
    private static final Pattern CHINESE = Pattern.compile("[\\u4e00-\\u9fff]");
    private static final Pattern SCHEME = Pattern.compile("^https?://");
    private static final Pattern TRAILING_SLASH = Pattern.compile("/$");

    private static final List<String> LIST_KEYS =
            List.of("webpages", "WebResults", "webResults", "results", "items", "list", "data", "web");

    private static final List<SourceTier> SOURCE_TIERS = List.of(
            new SourceTier(0, Pattern.compile("(^|\\.)gov\\.cn(/|$|:)|(^|\\.)gov(/|$|:)", Pattern.CASE_INSENSITIVE)),
            new SourceTier(1, Pattern.compile(
                    "(xinhuanet|people\\.com\\.cn|news\\.cn|chinanews|chinadaily|cctv|gmw\\.cn|qstheory|china\\.com\\.cn)",
                    Pattern.CASE_INSENSITIVE)),
            new SourceTier(2, Pattern.compile(
                    "(^|\\.)edu\\.cn(/|$)|(^|\\.)org\\.cn(/|$)|(^|\\.)ac\\.cn(/|$)|moe\\.gov",
                    Pattern.CASE_INSENSITIVE)),
            new SourceTier(4, Pattern.compile(
                    "(weixin\\.qq\\.com|mp\\.weixin|zhihu\\.com|toutiao|baijiahao|sohu\\.com|163\\.com|sina\\.com|bilibili|xiaohongshu|douban|jianshu)",
                    Pattern.CASE_INSENSITIVE)));

    private static final Pattern GUESS_FULL =
            Pattern.compile("(20\\d{2})\\s*[-/年]\\s*(\\d{1,2})\\s*[-/月]\\s*(\\d{1,2})");
    private static final Pattern GUESS_MONTH = Pattern.compile("(20\\d{2})\\s*年\\s*(\\d{1,2})\\s*月");

    private static final Pattern BING_U = Pattern.compile("[?&]u=a1([A-Za-z0-9\\-_]+)");
    private static final Pattern BING_BLOCK = Pattern.compile("<li class=\"b_algo\"[\\s\\S]*?</li>");
    private static final Pattern BING_LINK =
            Pattern.compile("<h2[^>]*>\\s*<a[^>]+href=\"([^\"]+)\"[^>]*>([\\s\\S]*?)</a>");
    private static final Pattern BING_SNIPPET = Pattern.compile("<p[^>]*>([\\s\\S]*?)</p>");
    private static final Pattern TAGS = Pattern.compile("<[^>]+>");
    private static final Pattern DDG_LINK =
            Pattern.compile("<a[^>]+class=\"[^\"]*result__a[^\"]*\"[^>]*href=\"([^\"]+)\"[^>]*>([\\s\\S]*?)</a>");
    private static final Pattern DDG_SNIPPET =
            Pattern.compile("<a[^>]+class=\"[^\"]*result__snippet[^\"]*\"[^>]*>([\\s\\S]*?)</a>");
    private static final Pattern DDG_UDDG = Pattern.compile("uddg=([^&]+)");

    private static final Pattern FINANCE_PATTERN = Pattern.compile(
            "(股票|个股|股价|行情|大盘|指数|上证|深证|创业板|科创|沪深|涨停|跌停|龙虎榜|市盈率|估值|市值|财务报表|营收|净利润|分红|股息|可转债|转债|新股|打新|申购|中签|基金|ETF|期货|黄金|白银|原油|外汇|汇率|美元|人民币|债券|国债|利率|加息|降息|央行|美联储|GDP|CPI|PPI|M2|通胀|通缩|宏观|财经|股指|券商|板块|龙头|北向资金|融资融券)",
            Pattern.CASE_INSENSITIVE);

    /** Bing 三个索引变体（国内 ensearch 全球 / .com 全球 / 国内默认）互补取量。 */
    private static final List<String[]> BING_VARIANTS = List.of(
            new String[]{"https://cn.bing.com/search", "&ensearch=1"},
            new String[]{"https://www.bing.com/search", "&ensearch=1&cc=us"},
            new String[]{"https://cn.bing.com/search", ""});

    private static final String BROWSER_UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

    // ===== 进程内状态 =====
    private final Map<String, BreakerState> breaker = new ConcurrentHashMap<>();
    private final Map<String, SessionState> sessionUsage = new ConcurrentHashMap<>();
    private final Map<String, Long> lastCallAt = new ConcurrentHashMap<>();
    private final Map<String, CacheEntry> searchCache = new LinkedHashMap<>();
    private final Object cacheLock = new Object();
    private final Object throttleLock = new Object();

    private final SearchSourceService searchSourceService;
    private final AiSettingsService aiSettingsService;
    private final ObjectMapper objectMapper;
    private final AppProperties appProperties;
    private final HttpClient httpClient;

    public WebSearchService(SearchSourceService searchSourceService,
                            AiSettingsService aiSettingsService,
                            ObjectMapper objectMapper,
                            AppProperties appProperties) {
        this.searchSourceService = searchSourceService;
        this.aiSettingsService = aiSettingsService;
        this.objectMapper = objectMapper;
        this.appProperties = appProperties;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(15))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    /** 函数式接口，等价 Node 端注入的 {@code getSecret(name)}。 */
    @FunctionalInterface
    public interface SecretProvider {
        String getSecret(String name) throws Exception;
    }

    /** 默认密钥来源：按租户从 ai_settings 读取并解密（对齐 backend/ai-settings.js 的 getUserSecret）。 */
    public SecretProvider userSecretProvider() {
        return aiSettingsService::getUserSecret;
    }

    /** 检索失败 / 熔断异常，{@code code} 对齐 Node 的 error.code。 */
    public static class SearchException extends RuntimeException {
        private final String code;
        private final Integer status;

        public SearchException(String message) {
            this(message, null, null);
        }

        public SearchException(String message, String code, Integer status) {
            super(message);
            this.code = code;
            this.status = status;
        }

        public String code() {
            return code;
        }

        public Integer status() {
            return status;
        }
    }

    // ==================================================================
    // 对外方法
    // ==================================================================

    /** 等价 Node 的 {@code multiSearch(query, { userId, getSecret })}。 */
    public Object multiSearch(String query, String userIdValue, SecretProvider getSecret) {
        String userId = userIdValue == null ? "" : userIdValue;
        String clean = JsStrings.trim(str(query));
        if (clean.length() > 200) {
            clean = clean.substring(0, 200);
        }
        if (clean.isEmpty()) {
            throw new SearchException("搜索关键词为空");
        }

        // 财经类：直接走 AKShare，不占用网页搜索额度，也不进降级链
        if (isFinanceQuery(clean)) {
            log.info("[Search] 财经查询走 AKShare 分支：{}", clean);
            try {
                Map<String, Object> payload = akShareQuery(clean);
                List<Map<String, Object>> results = toResults(fieldOf(payload, "items"));
                if (!results.isEmpty()) {
                    log.info("[Search] provider=AKShare status=200 query={} count={}", clean, results.size());
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("provider", "AKShare");
                    out.put("query", clean);
                    out.put("results", results);
                    out.put("cached", false);
                    out.put("finance", true);
                    out.put("intent", JsValues.orEmpty(fieldOf(payload, "intent")));
                    return out;
                }
                log.warn("[Search] AKShare 未返回结构化数据，降级进入网页搜索链：{}", clean);
            } catch (Exception err) {
                log.warn("[Search] AKShare 调用失败，降级进入网页搜索链：{}", err.getMessage());
            }
        }

        // 命中缓存直接返回，不消耗任何额度、也不计入会话上限
        Map<String, Object> cached = readCache(userId, clean);
        if (cached != null) {
            log.info("[Search] provider={} status=cache query={}", cached.get("provider"), clean);
            Map<String, Object> out = new LinkedHashMap<>(cached);
            out.put("cached", true);
            return out;
        }

        // 单会话总调用上限保护
        if (sessionQuotaExceeded(userId)) {
            throw new SearchException(
                    "本次会话联网检索已达上限 " + SESSION_LIMIT + " 次，请先消化已有资料或换个问题",
                    "SEARCH_SESSION_LIMIT", null);
        }

        List<List<Map<String, Object>>> groups = new ArrayList<>();
        List<String> attempted = new ArrayList<>();
        Exception lastError = null;
        String primaryProvider = "";

        for (Map<String, Object> source : searchSourceService.getSourceOrder()) {
            String id = str(source.get("id"));
            String name = str(source.get("name"));
            // 熔断冷却期内：直接跳过该源
            if (breakerOpen(id)) {
                log.info("[Search] {} 处于熔断冷却期，跳过", name);
                continue;
            }
            // 需要密钥的源，没配置就直接跳过（不消耗任何额度）
            String apiKey = "";
            String keyField = KEY_FIELDS.get(id);
            if (keyField != null) {
                try {
                    apiKey = getSecret.getSecret(keyField);
                } catch (Exception err) {
                    apiKey = "";
                }
                if (apiKey == null) {
                    apiKey = "";
                }
                if (apiKey.isEmpty()) {
                    log.info("[Search] {} 未配置密钥，跳过", name);
                    continue;
                }
            }

            int used = noteSessionCall(userId);
            try {
                List<Map<String, Object>> results = runSource(id, clean, apiKey);
                attempted.add(name);

                if (!results.isEmpty()) {
                    noteSuccess(id);
                    if (primaryProvider.isEmpty()) {
                        primaryProvider = name;
                    }
                    groups.add(results);
                    log.info("[Search] provider={} status=200 query={} count={} sessionUsed={}",
                            name, clean, results.size(), used);
                    // 任一级拿到结果即收手
                    break;
                }
                lastError = new SearchException("未返回结果");
                log.info("[Search] provider={} status=empty query={}", name, clean);
                if (noteFailure(id, "未返回结果")) {
                    throw new SearchException(name + " 连续失败已熔断，本轮搜索终止", "SEARCH_BREAKER_TRIPPED", null);
                }
            } catch (Exception err) {
                if (err instanceof SearchException se && "SEARCH_BREAKER_TRIPPED".equals(se.code())) {
                    throw se;
                }
                lastError = err;
                Object status = (err instanceof SearchException se && se.status() != null) ? se.status() : "error";
                log.warn("[Search] provider={} status={} query={} msg={}", name, status, clean, err.getMessage());
                if (noteFailure(id, err.getMessage())) {
                    throw new SearchException(name + " 连续失败已熔断，本轮搜索终止", "SEARCH_BREAKER_TRIPPED", null);
                }
            }
        }

        List<Map<String, Object>> merged = mergeResults(groups);
        if (merged.size() > RESULT_LIMIT) {
            merged = new ArrayList<>(merged.subList(0, RESULT_LIMIT));
        }
        if (!merged.isEmpty()) {
            // 送入模型前统一做质量过滤：外文站点丢掉后若一条不剩，宁可退回原始结果
            List<Map<String, Object>> prepared = prepareResults(merged);
            List<Map<String, Object>> results = !prepared.isEmpty()
                    ? prepared
                    : new ArrayList<>(merged.subList(0, Math.min(CONTEXT_LIMIT, merged.size())));
            Map<String, Object> value = new LinkedHashMap<>();
            value.put("provider", primaryProvider.isEmpty() ? "本地聚合" : primaryProvider);
            value.put("query", clean);
            value.put("results", results);
            value.put("cached", false);
            writeCache(userId, clean, value);
            return value;
        }

        String detail = !attempted.isEmpty()
                ? "已尝试：" + String.join(" → ", attempted)
                : "本地与免注册搜索源均不可用";
        throw new SearchException(lastError != null
                ? "全部搜索源均未取到结果（" + detail + "；最后错误：" + lastError.getMessage() + "）"
                : "全部搜索源均未取到结果（" + detail + "）");
    }

    /** 等价 {@code formatSearchContext(search)}：把检索结果压缩成可读文本。 */
    public String formatSearchContext(Object search) {
        List<Map<String, Object>> results = resultsOf(search);
        if (results.isEmpty()) {
            return "";
        }
        Object providerValue = fieldOf(search, "provider");
        String provider = providerValue == null ? "undefined" : JsValues.toJsString(providerValue);
        boolean cached = JsValues.truthy(fieldOf(search, "cached"));

        StringBuilder out = new StringBuilder();
        out.append("【联网检索结果｜来源：").append(provider).append(cached ? "，命中缓存" : "").append("】\n");
        List<String> lines = new ArrayList<>();
        for (int index = 0; index < results.size(); index++) {
            Map<String, Object> item = results.get(index);
            String url = str(item.get("url"));
            String source = url.isEmpty() ? "" : "（" + url + "）";
            String time = "｜发布时间：" + JsValues.orDefault(item.get("publishedAt"), "未知");
            lines.add((index + 1) + ". " + JsValues.orDefault(item.get("title"), "未命名") + source + time
                    + "\n" + JsValues.orEmpty(item.get("snippet")));
        }
        out.append(String.join("\n", lines));
        return out.toString();
    }

    /** 等价 {@code getSearchUsage(userId)}。 */
    public Map<String, Object> getSearchUsage(String userId) {
        SessionState state = readUsage(userId == null ? "" : userId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("used", state.count);
        out.put("limit", SESSION_LIMIT);
        return out;
    }

    /** 等价 {@code resetSearchSession(userId)}：清除某用户的会话计数。 */
    public Map<String, Object> resetSearchSession(String userId) {
        String key = userId == null ? "" : userId;
        sessionUsage.remove(key);
        return getSearchUsage(key);
    }

    /** 等价 {@code setSourceOrder(ids)}：委托 {@link SearchSourceService}，返回调整后的顺序。 */
    public List<Map<String, Object>> setSourceOrder(List<String> ids) {
        searchSourceService.setSourceOrder(ids);
        return searchSourceService.getSourceOrder();
    }

    /** 等价 {@code getSourceOrder()}：委托 {@link SearchSourceService}。 */
    public List<Map<String, Object>> getSourceOrder() {
        return searchSourceService.getSourceOrder();
    }

    /** 等价 {@code isFinanceQuery(query)}。 */
    public boolean isFinanceQuery(String query) {
        return FINANCE_PATTERN.matcher(str(query)).find();
    }

    // ==================================================================
    // provider 分发 / 各搜索源
    // ==================================================================

    private List<Map<String, Object>> runSource(String id, String query, String apiKey) throws Exception {
        switch (id) {
            case "metaso":
                return searchMetaso(query, apiKey);
            case "searxng":
                return searchSearxng(query);
            case "bing":
                return searchBing(query);
            case "volcengine":
                return searchVolcengine(query, apiKey);
            case "claw":
                return searchClaw(query);
            case "openserp":
                return searchOpenSerp(query);
            case "duckduckgo":
                return searchDuckDuckGo(query);
            case "tavily":
                return searchTavily(query, apiKey);
            default:
                return List.of();
        }
    }

    /** ① 秘塔 Metaso：POST /api/v1/search。 */
    private List<Map<String, Object>> searchMetaso(String query, String apiKey) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("q", query);
        body.put("scope", "webpage");
        body.put("includeSummary", false);
        body.put("page", "1");
        body.put("includeRawContent", false);
        body.put("conciseSnippet", false);
        HttpRequest request = HttpRequest.newBuilder(URI.create("https://metaso.cn/api/v1/search"))
                .timeout(Duration.ofMillis(TIMEOUT_MS))
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .POST(HttpRequest.BodyPublishers.ofString(
                        objectMapper.writeValueAsString(body), StandardCharsets.UTF_8))
                .build();
        HttpResponse<byte[]> response = send(request);
        if (!ok(response.statusCode())) {
            throw new SearchException("HTTP " + response.statusCode(), null, response.statusCode());
        }
        Object data = parseJson(response.body());
        List<?> list = extractResultList(data, 0);
        if (list.isEmpty()) {
            Object code = fieldOf(data, "code");
            if (JsValues.truthy(code)) {
                throw new SearchException("秘塔返回错误 " + JsValues.toJsString(code) + "："
                        + JsValues.orDefault(fieldOf(data, "message"), "未知原因"));
            }
        }
        return toResults(list);
    }

    /** ④ 豆包搜索（火山引擎）：POST /search_api/web_search。 */
    private List<Map<String, Object>> searchVolcengine(String query, String apiKey) throws Exception {
        Map<String, Object> filter = new LinkedHashMap<>();
        filter.put("NeedContent", false);
        filter.put("NeedUrl", true);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("Query", query);
        body.put("SearchType", "web");
        body.put("Count", Math.min(RESULT_LIMIT, 50));
        body.put("Filter", filter);
        HttpRequest request = HttpRequest.newBuilder(URI.create("https://open.feedcoopapi.com/search_api/web_search"))
                .timeout(Duration.ofMillis(TIMEOUT_MS))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .POST(HttpRequest.BodyPublishers.ofString(
                        objectMapper.writeValueAsString(body), StandardCharsets.UTF_8))
                .build();
        HttpResponse<byte[]> response = send(request);
        if (!ok(response.statusCode())) {
            throw new SearchException("HTTP " + response.statusCode(), null, response.statusCode());
        }
        Object data = parseJson(response.body());
        Object itemsValue = fieldOf(fieldOf(data, "Result"), "WebResults");
        if (!(itemsValue instanceof List<?> items)) {
            Object error = fieldOf(fieldOf(data, "ResponseMetadata"), "Error");
            if (error != null) {
                String code = JsValues.orEmpty(fieldOf(error, "Code"));
                String message = JsValues.orEmpty(fieldOf(error, "Message"));
                throw new SearchException(JsStrings.trim("豆包搜索错误 " + code + "：" + message));
            }
            throw new SearchException("豆包搜索未返回结果列表");
        }
        List<Map<String, Object>> mapped = new ArrayList<>();
        for (Object item : items) {
            Object snippet = fieldOf(item, "Summary");
            if (!JsValues.truthy(snippet)) {
                snippet = fieldOf(item, "Snippet");
            }
            if (!JsValues.truthy(snippet)) {
                snippet = fieldOf(item, "Content");
            }
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("title", fieldOf(item, "Title"));
            entry.put("url", fieldOf(item, "Url"));
            entry.put("snippet", snippet == null ? "" : snippet);
            entry.put("publishedAt", JsValues.orEmpty(fieldOf(item, "PublishTime")));
            mapped.add(entry);
        }
        return toResults(mapped);
    }

    /** ② SearXNG：GET /search?q=&format=json。 */
    private List<Map<String, Object>> searchSearxng(String query) throws Exception {
        throttle("searxng", SEARXNG_MIN_INTERVAL);
        String url = SEARXNG_URL + "/search?q=" + encodeUriComponent(query) + "&format=json";
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("Accept", "application/json");
        headers.put("User-Agent", "LifePlanner/1.0");
        HttpResponse<byte[]> response = get(url, headers);
        if (!ok(response.statusCode())) {
            throw new SearchException("HTTP " + response.statusCode(), null, response.statusCode());
        }
        Object data = parseJson(response.body());
        return toResults(fieldOf(data, "results"));
    }

    /** ⑤ Claw Search：GET /api/search?q=。 */
    private List<Map<String, Object>> searchClaw(String query) throws Exception {
        throttle("claw", CLAW_MIN_INTERVAL);
        String url = CLAW_URL + "/api/search?q=" + encodeUriComponent(query);
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("Accept", "application/json");
        headers.put("User-Agent", "LifePlanner/1.0");
        HttpResponse<byte[]> response = get(url, headers);
        if (!ok(response.statusCode())) {
            throw new SearchException("HTTP " + response.statusCode(), null, response.statusCode());
        }
        return toResults(extractResultList(parseJson(response.body()), 0));
    }

    /** ③ Bing：免 key 免注册，解析 b_algo 结果块。 */
    private List<Map<String, Object>> searchBing(String query) throws Exception {
        throttle("bing", BING_MIN_INTERVAL);
        List<Map<String, Object>> items = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        Exception firstError = null;
        for (String[] variant : BING_VARIANTS) {
            if (items.size() >= RESULT_LIMIT) {
                break;
            }
            String url = variant[0] + "?q=" + encodeUriComponent(query) + "&setlang=zh-CN" + variant[1];
            try {
                Map<String, String> headers = new LinkedHashMap<>();
                headers.put("User-Agent", BROWSER_UA);
                headers.put("Accept", "text/html,application/xhtml+xml");
                headers.put("Accept-Language", "zh-CN,zh;q=0.9");
                HttpResponse<byte[]> response = get(url, headers);
                int status = response.statusCode();
                if (status == 403 || status == 429) {
                    throw new SearchException("被拦截或被限流", null, status);
                }
                if (!ok(status)) {
                    throw new SearchException("HTTP " + status, null, status);
                }
                for (Map<String, Object> item : parseBingBlocks(bodyText(response.body()))) {
                    String itemUrl = str(item.get("url"));
                    String key = !itemUrl.isEmpty()
                            ? stripScheme(itemUrl).toLowerCase(Locale.ROOT)
                            : str(item.get("title"));
                    if (!key.isEmpty() && seen.contains(key)) {
                        continue;
                    }
                    if (!key.isEmpty()) {
                        seen.add(key);
                    }
                    items.add(item);
                }
            } catch (Exception err) {
                // 某个变体失败不该拖垮整条搜索
                if (firstError == null) {
                    firstError = err;
                }
            }
        }
        if (items.isEmpty() && firstError != null) {
            throw firstError;
        }
        return toResults(items);
    }

    /** ⑦ DuckDuckGo：解析 HTML 结果页。 */
    private List<Map<String, Object>> searchDuckDuckGo(String query) throws Exception {
        throttle("duckduckgo", DDG_MIN_INTERVAL);
        String url = "https://html.duckduckgo.com/html/?q=" + encodeUriComponent(query) + "&kl=cn-zh";
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("User-Agent", BROWSER_UA);
        headers.put("Accept", "text/html,application/xhtml+xml");
        headers.put("Accept-Language", "zh-CN,zh;q=0.9");
        HttpResponse<byte[]> response = get(url, headers);
        int status = response.statusCode();
        if (status == 403 || status == 202) {
            throw new SearchException("触发验证码拦截", null, status);
        }
        if (!ok(status)) {
            throw new SearchException("HTTP " + status, null, status);
        }
        String html = bodyText(response.body());

        List<String> snippets = new ArrayList<>();
        Matcher snippetMatcher = DDG_SNIPPET.matcher(html);
        while (snippetMatcher.find()) {
            snippets.add(snippetMatcher.group(1));
        }

        List<Map<String, Object>> items = new ArrayList<>();
        Matcher linkMatcher = DDG_LINK.matcher(html);
        int index = 0;
        while (linkMatcher.find() && items.size() < RESULT_LIMIT) {
            String href = linkMatcher.group(1);
            Matcher uddg = DDG_UDDG.matcher(href);
            if (uddg.find()) {
                href = decodeUriComponent(uddg.group(1));
            }
            if (href.startsWith("//")) {
                href = "https:" + href;
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("title", stripTags(linkMatcher.group(2)));
            item.put("url", href);
            item.put("snippet", stripTags(index < snippets.size() ? snippets.get(index) : ""));
            items.add(item);
            index += 1;
        }
        return toResults(items);
    }

    /** ⑥ OpenSERP：备选本地自托管。 */
    private List<Map<String, Object>> searchOpenSerp(String query) throws Exception {
        String limit = String.valueOf(RESULT_LIMIT);
        List<String> attempts = List.of(
                OPENSERP_URL + "/search?q=" + encodeUriComponent(query) + "&limit=" + limit + "&format=json",
                OPENSERP_URL + "/v1/search?q=" + encodeUriComponent(query) + "&limit=" + limit,
                OPENSERP_URL + "/search?q=" + encodeUriComponent(query) + "&engine=google&limit=" + limit);
        Exception lastError = null;
        for (String url : attempts) {
            try {
                Map<String, String> headers = new LinkedHashMap<>();
                headers.put("Accept", "application/json");
                HttpResponse<byte[]> response = get(url, headers);
                if (!ok(response.statusCode())) {
                    throw new SearchException("HTTP " + response.statusCode(), null, response.statusCode());
                }
                Object data = parseJson(response.body());
                Object listValue = data instanceof List<?>
                        ? data
                        : firstTruthy(fieldOf(data, "results"), fieldOf(data, "items"), fieldOf(data, "data"));
                List<Map<String, Object>> results = toResults(listValue == null ? List.of() : listValue);
                if (!results.isEmpty()) {
                    return results;
                }
                lastError = new SearchException("未返回结果");
            } catch (Exception err) {
                lastError = err;
            }
        }
        throw lastError != null ? lastError : new SearchException("OpenSERP 不可用");
    }

    /** ⑧ Tavily：终极兜底。 */
    private List<Map<String, Object>> searchTavily(String query, String apiKey) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("query", query);
        body.put("max_results", RESULT_LIMIT);
        body.put("search_depth", "basic");
        HttpRequest request = HttpRequest.newBuilder(URI.create("https://api.tavily.com/search"))
                .timeout(Duration.ofMillis(TIMEOUT_MS))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .POST(HttpRequest.BodyPublishers.ofString(
                        objectMapper.writeValueAsString(body), StandardCharsets.UTF_8))
                .build();
        HttpResponse<byte[]> response = send(request);
        if (!ok(response.statusCode())) {
            throw new SearchException("HTTP " + response.statusCode(), null, response.statusCode());
        }
        Object data = parseJson(response.body());
        return toResults(fieldOf(data, "results"));
    }

    // ==================================================================
    // 结果预处理 / 合并 / 去重
    // ==================================================================

    /** 等价 {@code sourceWeight(url)}：来源权威度分层，未命中的普通站点垫底(3)。 */
    private static int sourceWeight(String url) {
        String host = url == null ? "" : url.toLowerCase(Locale.ROOT);
        if (!host.isEmpty()) {
            for (SourceTier tier : SOURCE_TIERS) {
                if (tier.pattern().matcher(host).find()) {
                    return tier.weight();
                }
            }
        }
        return 3;
    }

    /** 等价 {@code hasChinese(text)}。 */
    private static boolean hasChinese(String text) {
        return CHINESE.matcher(text == null ? "" : text).find();
    }

    /** 等价 {@code guessPublishedAt(item)}。 */
    private static String guessPublishedAt(Map<String, Object> item) {
        String direct = JsStrings.trim(str(item.get("publishedAt")));
        if (!direct.isEmpty()) {
            return direct.length() > 10 ? direct.substring(0, 10) : direct;
        }
        String text = str(item.get("title")) + " " + str(item.get("snippet"));
        Matcher full = GUESS_FULL.matcher(text);
        if (full.find()) {
            return full.group(1) + "-" + pad2(full.group(2)) + "-" + pad2(full.group(3));
        }
        Matcher month = GUESS_MONTH.matcher(text);
        if (month.find()) {
            return month.group(1) + "-" + pad2(month.group(2));
        }
        return "";
    }

    /** 等价 {@code prepareResults(results)}：丢外文、按权威度排序、去重、限 {@link #CONTEXT_LIMIT} 条。 */
    private static List<Map<String, Object>> prepareResults(List<Map<String, Object>> results) {
        Set<String> seen = new HashSet<>();
        List<Map<String, Object>> kept = new ArrayList<>();
        for (Map<String, Object> item : results) {
            String title = JsStrings.trim(str(item.get("title")));
            String snippet = JsStrings.trim(str(item.get("snippet")));
            String url = JsStrings.trim(str(item.get("url")));
            if (title.isEmpty() && snippet.isEmpty() && url.isEmpty()) {
                continue;
            }
            if (!hasChinese(title + snippet)) {
                continue;
            }
            String key = !url.isEmpty() ? stripScheme(url).toLowerCase(Locale.ROOT) : title.toLowerCase(Locale.ROOT);
            if (!key.isEmpty() && seen.contains(key)) {
                continue;
            }
            if (!key.isEmpty()) {
                seen.add(key);
            }
            Map<String, Object> copy = new LinkedHashMap<>(item);
            copy.put("publishedAt", guessPublishedAt(item));
            kept.add(copy);
        }
        List<Weighted> weighted = new ArrayList<>();
        for (int index = 0; index < kept.size(); index++) {
            weighted.add(new Weighted(kept.get(index), index, sourceWeight(str(kept.get(index).get("url")))));
        }
        weighted.sort((a, b) -> a.weight != b.weight
                ? Integer.compare(a.weight, b.weight)
                : Integer.compare(a.index, b.index));
        List<Map<String, Object>> out = new ArrayList<>();
        for (int i = 0; i < weighted.size() && i < CONTEXT_LIMIT; i++) {
            out.add(weighted.get(i).item);
        }
        return out;
    }

    /** 等价 {@code mergeResults(groups)}：多源结果按 URL / 标题去重。 */
    private static List<Map<String, Object>> mergeResults(List<List<Map<String, Object>>> groups) {
        Set<String> seenUrl = new HashSet<>();
        Set<String> seenTitle = new HashSet<>();
        List<Map<String, Object>> merged = new ArrayList<>();
        for (List<Map<String, Object>> group : groups) {
            for (Map<String, Object> item : group) {
                String url = str(item.get("url"));
                String urlKey = !url.isEmpty() ? stripScheme(url).toLowerCase(Locale.ROOT) : "";
                String titleKey = JsStrings.trim(str(item.get("title"))).toLowerCase(Locale.ROOT);
                if (!urlKey.isEmpty() && seenUrl.contains(urlKey)) {
                    continue;
                }
                if (urlKey.isEmpty() && !titleKey.isEmpty() && seenTitle.contains(titleKey)) {
                    continue;
                }
                if (!urlKey.isEmpty()) {
                    seenUrl.add(urlKey);
                }
                if (!titleKey.isEmpty()) {
                    seenTitle.add(titleKey);
                }
                merged.add(item);
            }
        }
        return merged;
    }

    /** 等价 {@code toResults(list)}：统一各家字段大小写风格，截断到 {@link #RESULT_LIMIT} 条。 */
    private static List<Map<String, Object>> toResults(Object listValue) {
        List<?> list = listValue instanceof List<?> l ? l : List.of();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object item : list) {
            String title = clip(pick(item, "title", "name", "Title"));
            String url = JsStrings.trim(pick(item, "url", "link", "Url"));
            String snippet = clip(pick(item, "snippet", "Snippet", "content", "Content", "description", "summary"));
            String publishedAt = JsStrings.trim(pick(item,
                    "publishedDate", "published_at", "pubDate", "PublishTime", "date"));
            if (title.isEmpty() && snippet.isEmpty() && url.isEmpty()) {
                continue;
            }
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("title", title);
            entry.put("url", url);
            entry.put("snippet", snippet);
            entry.put("publishedAt", publishedAt);
            out.add(entry);
            if (out.size() >= RESULT_LIMIT) {
                break;
            }
        }
        return out;
    }

    /** 等价 {@code looksLikeResults(list)}：元素同时带标题和链接才算搜索结果。 */
    private static boolean looksLikeResults(List<?> list) {
        if (list == null || list.isEmpty()) {
            return false;
        }
        int limit = Math.min(3, list.size());
        for (int i = 0; i < limit; i++) {
            Object item = list.get(i);
            if (!(item instanceof Map<?, ?> map)) {
                continue;
            }
            boolean hasTitle = JsValues.truthy(map.get("title"))
                    || JsValues.truthy(map.get("name"))
                    || JsValues.truthy(map.get("Title"));
            boolean hasUrl = JsValues.truthy(map.get("url"))
                    || JsValues.truthy(map.get("link"))
                    || JsValues.truthy(map.get("Url"));
            if (hasTitle && hasUrl) {
                return true;
            }
        }
        return false;
    }

    /** 等价 {@code extractResultList(data, depth)}：浅层递归找「像搜索结果列表」的数组。 */
    private static List<?> extractResultList(Object data, int depth) {
        if (!(data instanceof Map) && !(data instanceof List)) {
            return List.of();
        }
        if (data instanceof List<?> list) {
            return looksLikeResults(list) ? list : List.of();
        }
        Map<?, ?> map = (Map<?, ?>) data;
        for (String key : LIST_KEYS) {
            Object value = map.get(key);
            if (value instanceof List<?> list && looksLikeResults(list)) {
                return list;
            }
        }
        if (depth >= 2) {
            return List.of();
        }
        for (String key : LIST_KEYS) {
            List<?> found = extractResultList(map.get(key), depth + 1);
            if (!found.isEmpty()) {
                return found;
            }
        }
        return List.of();
    }

    // ==================================================================
    // Bing / DDG HTML 解析工具
    // ==================================================================

    /** 等价 {@code decodeBingUrl(href)}：还原 Bing 的 bing.com/ck/a?…&u=a1<base64url> 跳转。 */
    private static String decodeBingUrl(String href) {
        Matcher match = BING_U.matcher(href == null ? "" : href);
        if (!match.find()) {
            return href;
        }
        try {
            String text = match.group(1).replace('-', '+').replace('_', '/');
            int pad = (4 - text.length() % 4) % 4;
            if (pad > 0) {
                text = text + "=".repeat(pad);
            }
            String decoded = new String(Base64.getDecoder().decode(text), StandardCharsets.UTF_8);
            return decoded.startsWith("http://") || decoded.startsWith("https://") ? decoded : href;
        } catch (Exception err) {
            return href;
        }
    }

    /** 等价 {@code parseBingBlocks(html)}。 */
    private static List<Map<String, Object>> parseBingBlocks(String html) {
        List<Map<String, Object>> items = new ArrayList<>();
        Matcher block = BING_BLOCK.matcher(html == null ? "" : html);
        while (block.find()) {
            String blockHtml = block.group();
            Matcher link = BING_LINK.matcher(blockHtml);
            if (!link.find()) {
                continue;
            }
            Matcher snippet = BING_SNIPPET.matcher(blockHtml);
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("title", stripTags(link.group(2)));
            item.put("url", decodeBingUrl(link.group(1)));
            item.put("snippet", stripTags(snippet.find() ? snippet.group(1) : ""));
            items.add(item);
        }
        return items;
    }

    /** 等价 {@code stripTags(html)}。 */
    private static String stripTags(String html) {
        String value = html == null ? "" : html;
        value = TAGS.matcher(value).replaceAll("");
        value = value.replace("&nbsp;", " ");
        value = value.replace("&amp;", "&");
        value = value.replace("&lt;", "<");
        value = value.replace("&gt;", ">");
        value = value.replace("&quot;", "\"");
        value = value.replaceAll("&#x27;|&#39;", "'");
        return JsStrings.trim(value);
    }

    // ==================================================================
    // AKShare 财经分支（Python 子进程）
    // ==================================================================

    /** 等价 {@code akShareQuery(query)}：调 quant/finance_query.py 拿结构化数据。 */
    private Map<String, Object> akShareQuery(String query) throws Exception {
        Path root = projectRoot();
        Path script = root.resolve("quant").resolve("finance_query.py");
        String arg = query.length() > 200 ? query.substring(0, 200) : query;
        ProcessBuilder builder = new ProcessBuilder(pythonBin(root), script.toString(), arg);
        builder.directory(root.toFile());
        // 对齐 Node 端 spawn 的实际运行环境
        Map<String, String> env = builder.environment();
        env.remove("PYTHONUTF8");
        env.remove("PYTHONIOENCODING");
        env.remove("PYTHONLEGACYWINDOWSSTDIO");
        env.remove("PYTHONLEGACYWINDOWSFSENCODING");
        Process process = builder.start();

        StringBuilder stdout = new StringBuilder();
        StringBuilder stderr = new StringBuilder();
        Thread stdoutReader = reader(process.getInputStream(), stdout);
        Thread stderrReader = reader(process.getErrorStream(), stderr);
        stdoutReader.start();
        stderrReader.start();

        if (!process.waitFor(AKSHARE_TIMEOUT, TimeUnit.MILLISECONDS)) {
            process.destroyForcibly();
            stdoutReader.join(2000);
            stderrReader.join(2000);
            String lastLine = lastNonEmptyLine(stderr.toString());
            throw new SearchException(lastLine.isEmpty() ? "akshare 调用失败" : lastLine);
        }
        stdoutReader.join(2000);
        stderrReader.join(2000);

        int exitCode = process.exitValue();
        if (exitCode != 0) {
            String lastLine = lastNonEmptyLine(stderr.toString());
            throw new SearchException(lastLine.isEmpty() ? "akshare 调用失败" : lastLine);
        }
        String text = JsStrings.trim(stdout.toString());
        String[] lines = text.split("\n", -1);
        String payload = lines[lines.length - 1];
        try {
            Object parsed = objectMapper.readValue(payload, Object.class);
            if (parsed instanceof Map<?, ?> map) {
                Map<String, Object> result = new LinkedHashMap<>();
                for (Map.Entry<?, ?> entry : map.entrySet()) {
                    result.put(String.valueOf(entry.getKey()), entry.getValue());
                }
                return result;
            }
            return new LinkedHashMap<>();
        } catch (Exception parseError) {
            throw new SearchException("akshare 输出解析失败：" + parseError.getMessage());
        }
    }

    /** 等价 {@code pythonBin()}：PYTHON_BIN 优先，其次 quant/.venv，最后回落 "python"。 */
    private String pythonBin(Path root) {
        String configured = System.getenv("PYTHON_BIN");
        if (configured != null && !configured.isEmpty()) {
            return configured;
        }
        Path venv = root.resolve("quant").resolve(".venv").resolve("Scripts").resolve("python.exe");
        if (Files.exists(venv)) {
            return venv.toString();
        }
        return "python";
    }

    private Path projectRoot() {
        String configured = appProperties.getProjectDir();
        File dir = new File(configured == null || configured.isBlank() ? ".." : configured);
        return dir.getAbsoluteFile().toPath().normalize();
    }

    private static Thread reader(InputStream stream, StringBuilder sink) {
        Thread thread = new Thread(() -> {
            try (InputStream in = stream) {
                sink.append(Utf8Js.decode(in.readAllBytes()));
            } catch (Exception ignored) {
                // 忽略
            }
        });
        thread.setDaemon(true);
        return thread;
    }

    private static String lastNonEmptyLine(String text) {
        String last = "";
        for (String line : (text == null ? "" : text).split("\n", -1)) {
            if (!line.isEmpty()) {
                last = line;
            }
        }
        return last;
    }

    // ==================================================================
    // HTTP / 编码工具
    // ==================================================================

    private HttpResponse<byte[]> send(HttpRequest request) throws Exception {
        return httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
    }

    private HttpResponse<byte[]> get(String url, Map<String, String> headers) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofMillis(TIMEOUT_MS))
                .GET();
        for (Map.Entry<String, String> header : headers.entrySet()) {
            builder.header(header.getKey(), header.getValue());
        }
        return send(builder.build());
    }

    private Object parseJson(byte[] body) throws Exception {
        return objectMapper.readValue(Utf8Js.decode(body), Object.class);
    }

    private static String bodyText(byte[] body) {
        return Utf8Js.decode(body);
    }

    private static boolean ok(int status) {
        return status >= 200 && status < 300;
    }

    /** 等价 JS 的 {@code encodeURIComponent}。 */
    private static String encodeUriComponent(String value) {
        byte[] bytes = (value == null ? "" : value).getBytes(StandardCharsets.UTF_8);
        StringBuilder out = new StringBuilder(bytes.length);
        for (byte raw : bytes) {
            int code = raw & 0xFF;
            boolean unreserved = (code >= 'A' && code <= 'Z')
                    || (code >= 'a' && code <= 'z')
                    || (code >= '0' && code <= '9')
                    || code == '-' || code == '_' || code == '.' || code == '!'
                    || code == '~' || code == '*' || code == '\'' || code == '(' || code == ')';
            if (unreserved) {
                out.append((char) code);
            } else {
                out.append('%').append(String.format("%02X", code));
            }
        }
        return out.toString();
    }

    /** 等价 JS 的 {@code decodeURIComponent}（不把 {@code +} 当空格）。 */
    private static String decodeUriComponent(String value) {
        if (value == null) {
            return "";
        }
        try {
            return URLDecoder.decode(value.replace("+", "%2B"), StandardCharsets.UTF_8);
        } catch (Exception err) {
            return value;
        }
    }

    // ==================================================================
    // 缓存 / 熔断 / 会话 / 节流
    // ==================================================================

    private static String cacheKey(String userId, String query) {
        return userId + "::" + WHITESPACE_RUN.matcher(str(query)).replaceAll(" ")
                .trim().toLowerCase(Locale.ROOT);
    }

    private Map<String, Object> readCache(String userId, String query) {
        String key = cacheKey(userId, query);
        synchronized (cacheLock) {
            CacheEntry hit = searchCache.get(key);
            if (hit == null) {
                return null;
            }
            if (System.currentTimeMillis() - hit.at > CACHE_TTL) {
                searchCache.remove(key);
                return null;
            }
            return hit.value;
        }
    }

    private void writeCache(String userId, String query, Map<String, Object> value) {
        String key = cacheKey(userId, query);
        synchronized (cacheLock) {
            if (searchCache.size() >= CACHE_MAX) {
                var iterator = searchCache.keySet().iterator();
                if (iterator.hasNext()) {
                    searchCache.remove(iterator.next());
                }
            }
            searchCache.put(key, new CacheEntry(System.currentTimeMillis(), value));
        }
    }

    private BreakerState breakerState(String id) {
        return breaker.computeIfAbsent(id, key -> new BreakerState());
    }

    private boolean breakerOpen(String id) {
        BreakerState state = breakerState(id);
        if (state.openUntil == 0) {
            return false;
        }
        if (System.currentTimeMillis() >= state.openUntil) {
            state.fails = 0;
            state.openUntil = 0;
            log.info("[Search] 熔断冷却结束，重新启用 {}", id);
            return false;
        }
        return true;
    }

    private boolean noteFailure(String id, String message) {
        BreakerState state = breakerState(id);
        state.fails += 1;
        state.lastError = message;
        if (state.fails >= BREAKER_THRESHOLD) {
            state.openUntil = System.currentTimeMillis() + BREAKER_COOLDOWN;
            log.warn("[Search] {} 连续失败 {} 次，已熔断，冷却 10 分钟（{}）", id, state.fails, message);
            return true;
        }
        return false;
    }

    private void noteSuccess(String id) {
        BreakerState state = breakerState(id);
        state.fails = 0;
        state.openUntil = 0;
    }

    private SessionState readUsage(String userId) {
        SessionState state = sessionUsage.get(userId);
        if (state == null || System.currentTimeMillis() - state.at > SESSION_WINDOW) {
            SessionState fresh = new SessionState();
            fresh.count = 0;
            fresh.at = System.currentTimeMillis();
            return fresh;
        }
        return state;
    }

    private boolean sessionQuotaExceeded(String userId) {
        return readUsage(userId).count >= SESSION_LIMIT;
    }

    private int noteSessionCall(String userId) {
        SessionState state = readUsage(userId);
        state.count += 1;
        state.at = System.currentTimeMillis();
        sessionUsage.put(userId, state);
        return state.count;
    }

    /** 请求间隔保护：抓取型源高频连打会被弹验证码或限流。 */
    private void throttle(String id, long gapMs) {
        synchronized (throttleLock) {
            long wait = gapMs - (System.currentTimeMillis() - lastCallAt.getOrDefault(id, 0L));
            if (wait > 0) {
                try {
                    Thread.sleep(wait);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                }
            }
            lastCallAt.put(id, System.currentTimeMillis());
        }
    }

    // ==================================================================
    // 内部工具
    // ==================================================================

    private static List<Map<String, Object>> resultsOf(Object search) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (search instanceof Map<?, ?> map && map.get("results") instanceof List<?> list) {
            for (Object item : list) {
                if (item instanceof Map<?, ?> itemMap) {
                    Map<String, Object> copy = new LinkedHashMap<>();
                    for (Map.Entry<?, ?> entry : itemMap.entrySet()) {
                        copy.put(String.valueOf(entry.getKey()), entry.getValue());
                    }
                    out.add(copy);
                }
            }
        }
        return out;
    }

    private static Object fieldOf(Object container, String key) {
        return container instanceof Map<?, ?> map ? map.get(key) : null;
    }

    private static Object firstTruthy(Object... values) {
        for (Object value : values) {
            if (JsValues.truthy(value)) {
                return value;
            }
        }
        return null;
    }

    /** 等价 {@code item?.a || item?.b || … || ''}。 */
    private static String pick(Object item, String... keys) {
        if (item instanceof Map<?, ?> map) {
            for (String key : keys) {
                Object value = map.get(key);
                if (JsValues.truthy(value)) {
                    return JsValues.toJsString(value);
                }
            }
        }
        return "";
    }

    /** 等价 {@code String(text||'').replace(/\\s+/g,' ').trim()} 并截断到 {@link #SNIPPET_MAX}。 */
    private static String clip(Object text) {
        String value = JsStrings.trim(WHITESPACE_RUN.matcher(str(text)).replaceAll(" "));
        return value.length() > SNIPPET_MAX ? value.substring(0, SNIPPET_MAX) + "…" : value;
    }

    /** 等价 {@code url.replace(/^https?:\\/\\//,'').replace(/\\/$/,'')}。 */
    private static String stripScheme(String url) {
        String value = SCHEME.matcher(url == null ? "" : url).replaceFirst("");
        return TRAILING_SLASH.matcher(value).replaceFirst("");
    }

    private static String pad2(String value) {
        return value.length() >= 2 ? value : "0" + value;
    }

    private static String str(Object value) {
        return value == null ? "" : JsValues.toJsString(value);
    }

    private static String envOr(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isEmpty() ? fallback : value;
    }

    private static int intEnv(String name, int fallback) {
        String value = System.getenv(name);
        if (value == null || value.isEmpty()) {
            return fallback;
        }
        try {
            return (int) Double.parseDouble(value.trim());
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private record SourceTier(int weight, Pattern pattern) {
    }

    private record Weighted(Map<String, Object> item, int index, int weight) {
    }

    private static final class CacheEntry {
        private final long at;
        private final Map<String, Object> value;

        private CacheEntry(long at, Map<String, Object> value) {
            this.at = at;
            this.value = value;
        }
    }

    private static final class BreakerState {
        private int fails;
        private long openUntil;
        private String lastError = "";
    }

    private static final class SessionState {
        private int count;
        private long at;
    }
}
