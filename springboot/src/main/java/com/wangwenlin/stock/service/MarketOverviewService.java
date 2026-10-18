package com.wangwenlin.stock.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.mapper.AiSettingsMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 大盘概览（/api/market/overview）。逐行对齐 Node 端 server.js 12456-12750：
 * 进程级内存缓存（TTL 可被 ai_settings.market_fetch_interval 覆盖，最低 45 秒），
 * 六路外部行情（新浪纳指 / 腾讯四大指数 / 新浪全A分页统计），非交易时段继续后台刷新纳指。
 */
@Service
public class MarketOverviewService {

    private static final Logger log = LoggerFactory.getLogger(MarketOverviewService.class);

    private static final String USER_AGENT = "Mozilla/5.0";
    private static final String SINA_REFERER = "https://finance.sina.com.cn/";
    private static final Charset GBK = Charset.forName("GB18030");
    private static final ZoneId BEIJING = ZoneId.of("Asia/Shanghai");
    private static final Pattern QUOTED = Pattern.compile("=\"([^\"]+)\"");

    private static final long DEFAULT_MARKET_CACHE_TTL = 60000L;
    private static final long MIN_MARKET_CACHE_TTL = 45000L;

    private static final Map<String, String> IDX_NAME_MAP = Map.of(
            "000001", "上证指数",
            "399001", "深证成指",
            "399006", "创业板指",
            "899050", "北证50");

    private final AiSettingsMapper aiSettingsMapper;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final ExecutorService nasdaqRefresher = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "market-nasdaq-refresh");
        thread.setDaemon(true);
        return thread;
    });

    /** 对应 Node 的模块级变量 _marketCache。 */
    private volatile Map<String, Object> marketCacheData;
    private volatile long marketCacheTime;
    /** 对应 _marketPrevCloseAmountYi：昨日收盘时沪深京全天成交额（亿）。 */
    private volatile Long marketPrevCloseAmountYi;
    /** 对应 _marketIntervalSetting：value 为 null 表示未读到有效设置（JS 的 null）。 */
    private volatile String intervalSettingValue;
    private volatile long intervalSettingTime;

    public MarketOverviewService(AiSettingsMapper aiSettingsMapper, ObjectMapper objectMapper) {
        this.aiSettingsMapper = aiSettingsMapper;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(8))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    // ==================== 入口 ====================

    public Map<String, Object> overview() {
        double ttl = marketCacheTtl();
        boolean marketClosed = !isTradingTime();

        Map<String, Object> cache = marketCacheData;
        if (cache != null && System.currentTimeMillis() - marketCacheTime < ttl) {
            return withMarketClosed(cache, marketClosed);
        }
        // 非 A 股交易时段且有缓存：A 股数据直接用缓存，后台异步刷新纳指（24h 可交易）
        if (marketClosed && cache != null) {
            nasdaqRefresher.submit(this::refreshNasdaqOnly);
            return withMarketClosed(cache, marketClosed);
        }

        long startTime = System.currentTimeMillis();
        try {
            FetchResult result = fetchAll(startTime, marketClosed);
            if (result.reuseCache()) {
                // 拉回来的全是零且有有效缓存：保留旧缓存（已并入刚刷新的纳指），不覆盖缓存
                return result.data();
            }
            marketCacheData = result.data();
            marketCacheTime = System.currentTimeMillis();
            return result.data();
        } catch (Exception error) {
            log.error("[market overview] fetch failed: {}", error.getMessage());
            return marketCacheData;
        }
    }

    /**
     * 抓取结果：reuseCache=true 表示应原样返回 data 且不覆盖内存缓存
     * （对应 Node 端 allZeroA 分支直接 return cached 的行为）。
     */
    private record FetchResult(Map<String, Object> data, boolean reuseCache) {
    }

    /** 等价 Node 端 getMarketCacheTTL：读 ai_settings 的 market_fetch_interval，带 60 秒进程级缓存。 */
    private double marketCacheTtl() {
        long now = System.currentTimeMillis();
        String value = intervalSettingValue;
        if (value != null && now - intervalSettingTime < 60000) {
            return clampTtl(value);
        }
        try {
            String fresh = aiSettingsMapper.valueOfKey("market_fetch_interval");
            intervalSettingValue = fresh;
            intervalSettingTime = now;
            return clampTtl(fresh);
        } catch (Exception error) {
            return DEFAULT_MARKET_CACHE_TTL;
        }
    }

    private static double clampTtl(String value) {
        Double parsed = JsValues.parse(value);
        double numeric = (parsed == null || parsed == 0d) ? DEFAULT_MARKET_CACHE_TTL : parsed;
        return Math.max(numeric, MIN_MARKET_CACHE_TTL);
    }

    /** 等价 Node 端 isTradingTime：9:15-11:30 或 13:00-15:00，周一至周五。 */
    private static boolean isTradingTime() {
        ZonedDateTime now = ZonedDateTime.now(BEIJING);
        DayOfWeek day = now.getDayOfWeek();
        if (day == DayOfWeek.SATURDAY || day == DayOfWeek.SUNDAY) {
            return false;
        }
        int minutes = now.getHour() * 60 + now.getMinute();
        return (minutes >= 9 * 60 + 15 && minutes <= 11 * 60 + 30)
                || (minutes >= 13 * 60 && minutes <= 15 * 60);
    }

    private static Map<String, Object> withMarketClosed(Map<String, Object> cache, boolean marketClosed) {
        Map<String, Object> result = new LinkedHashMap<>(cache);
        if (marketClosed) {
            result.put("marketClosed", true);
        }
        return result;
    }

    // ==================== 全量抓取 ====================

    /**
     * 抓取 A 股 + 纳指行情。当 A 股全为 0 且已有有效缓存时返回 reuseCache=true 的结果
     * （对应 Node 端保留旧缓存 + 并入纳指的分支）。
     */
    private FetchResult fetchAll(long startTime, boolean marketClosed) {
        // === 0. 纳斯达克（24h，用新浪接口） ===
        Map<String, Object> nasdaq = fetchNasdaq(Duration.ofSeconds(8));

        // === 1. A股指数行情（名称硬编码，彻底避免 GBK 乱码） ===
        List<Map<String, Object>> indicesData = new ArrayList<>();
        try {
            byte[] raw = getBytes("http://qt.gtimg.cn/q=sh000001,sz399001,sz399006,bj899050",
                    SINA_REFERER, Duration.ofSeconds(8));
            String idxRaw = new String(raw, GBK);
            for (String line : idxRaw.split("\n")) {
                String trimmed = line.trim();
                if (!trimmed.startsWith("v_")) {
                    continue;
                }
                Matcher matcher = QUOTED.matcher(trimmed);
                if (!matcher.find()) {
                    continue;
                }
                String[] parts = matcher.group(1).split("~");
                if (parts.length < 40) {
                    continue;
                }
                String code = parts[2];
                Double price = JsValues.parse(parts[3]);
                Double chgRate = JsValues.parse(parts[32]);
                Double amount = JsValues.parse(parts[38]);
                indicesData.add(index(code, price, chgRate,
                        amount == null ? Double.NaN : amount * 10000d,
                        IDX_NAME_MAP.getOrDefault(code, code), false));
            }
        } catch (Exception error) {
            log.warn("[market] tencent idx fail: {}", error.getMessage());
        }

        Map<String, Object> sh = findIndex(indicesData, "000001");
        Map<String, Object> cy = findIndex(indicesData, "399006");

        // === 2. 全A股涨跌停 + 总成交额（新浪，分页） ===
        long riseCount = 0;
        long fallCount = 0;
        long flatCount = 0;
        long upLimit = 0;
        long downLimit = 0;
        double totalAmountYuan = 0;
        try {
            String totalRaw = get("http://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php"
                    + "/Market_Center.getHQNodeStockCount?node=hs_a", SINA_REFERER, Duration.ofSeconds(8));
            Long parsedCount = JsValues.parseIntOrNull(totalRaw.replace("\"", ""));
            long totalStocks = (parsedCount == null || parsedCount == 0L) ? 5500L : parsedCount;
            int pageSize = 100;
            int totalPages = (int) Math.ceil(totalStocks / (double) pageSize);
            int maxPages = Math.min(totalPages, 55);

            for (int page = 1; page <= maxPages; page++) {
                String pageUrl = "http://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php"
                        + "/Market_Center.getHQNodeData?page=" + page + "&num=" + pageSize
                        + "&sort=amount&asc=0&node=hs_a&symbol=&_s_r_a=sort";
                try {
                    List<Map<String, Object>> stocks = readList(get(pageUrl, SINA_REFERER, Duration.ofSeconds(8)));
                    if (stocks == null || stocks.isEmpty()) {
                        continue;
                    }
                    for (Map<String, Object> stock : stocks) {
                        Double pct = JsValues.parse(stock.get("changepercent"));
                        Double amt = JsValues.parse(stock.get("amount"));
                        double pctValue = pct == null ? Double.NaN : pct;
                        if (amt != null && amt > 0) {
                            totalAmountYuan += amt;
                        }
                        if (pctValue > 0.01) {
                            riseCount++;
                        } else if (pctValue < -0.01) {
                            fallCount++;
                        } else {
                            flatCount++;
                        }
                        Object codeRaw = stock.get("code");
                        String code = codeRaw == null ? "" : String.valueOf(codeRaw);
                        boolean isGEM = code.startsWith("30") || code.startsWith("688");
                        boolean isBJ = code.startsWith("4") || code.startsWith("8");
                        double limitPct = isGEM ? 20d : (isBJ ? 30d : 10d);
                        if (pctValue >= limitPct - 0.3) {
                            upLimit++;
                        }
                        if (pctValue <= -(limitPct - 0.3)) {
                            downLimit++;
                        }
                    }
                    if (page < maxPages) {
                        Thread.sleep(80L);
                    }
                } catch (Exception pageError) {
                    // 单页失败继续
                }
            }
        } catch (Exception error) {
            log.warn("[market] sina fetch fail: {}", error.getMessage());
        }

        long totalAmountYi = Math.round(totalAmountYuan / 1e8);

        // === 3. 成交额较昨日收盘的增量 ===
        Object amountDiffYi = null;
        if (marketClosed) {
            // 闭市时：把当前 totalAmountYi 存为下一次的"昨日基准"
            if (totalAmountYi > 0) {
                marketPrevCloseAmountYi = totalAmountYi;
            }
        }
        Long prevCloseAmount = marketPrevCloseAmountYi;
        // 交易时段：用"今日累计 vs 昨日收盘基准"算差值
        if (!marketClosed && prevCloseAmount != null && prevCloseAmount > 0 && totalAmountYi > 0) {
            amountDiffYi = totalAmountYi - prevCloseAmount;
        }

        // === 4. 大小盘对比 ===
        double largeCapChg = sh != null ? ((Number) sh.get("chgRate")).doubleValue() : 0d;
        double smallCapChg = cy != null ? ((Number) cy.get("chgRate")).doubleValue() : 0d;

        List<Map<String, Object>> indices = new ArrayList<>();
        if (nasdaq != null) {
            indices.add(nasdaq);
        }
        indices.addAll(indicesData);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("updatedAt", System.currentTimeMillis());
        data.put("totalAmountYi", totalAmountYi);
        data.put("amountDiffYi", amountDiffYi);
        // JS 里 amountDiffSign 由 `amountDiffYi >= 0` 决定，null >= 0 为 true，故未计算时恒为 1
        data.put("amountDiffSign", amountDiffYi == null || ((Number) amountDiffYi).doubleValue() >= 0 ? 1 : -1);
        data.put("indices", indices);
        data.put("largeCapChg", toFixedNumber(largeCapChg, 2));
        data.put("smallCapChg", toFixedNumber(smallCapChg, 2));
        data.put("sizeDiff", toFixedNumber(smallCapChg - largeCapChg, 2));
        data.put("riseCount", riseCount);
        data.put("fallCount", fallCount);
        data.put("flatCount", flatCount);
        data.put("upLimit", upLimit);
        data.put("downLimit", downLimit);
        data.put("yesterdayZtPercent", null);
        data.put("_fetchMs", System.currentTimeMillis() - startTime);
        if (marketClosed) {
            data.put("marketClosed", true);
        }

        // 拉回来的全是零（周末新浪返回空），且已有有效缓存 → 保留旧缓存 + 并入刚刷新的纳指
        boolean allZeroA = totalAmountYi == 0 && riseCount == 0 && aIndicesAllZero(indices);
        Map<String, Object> existing = marketCacheData;
        if (allZeroA && existing != null && toLong(existing.get("totalAmountYi")) > 0) {
            return new FetchResult(mergeZeroCache(existing, nasdaq), true);
        }
        return new FetchResult(data, false);
    }

    /** 等价 Node 端 data.indices.filter(i => !i.isUS).every(i => !i.price || i.price <= 0)。 */
    private static boolean aIndicesAllZero(List<Map<String, Object>> indices) {
        for (Map<String, Object> idx : indices) {
            if (Boolean.TRUE.equals(idx.get("isUS"))) {
                continue;
            }
            Object price = idx.get("price");
            if (price instanceof Number number && number.doubleValue() > 0) {
                return false;
            }
        }
        return true;
    }

    /**
     * 等价 Node 端 allZeroA 分支：保留旧缓存 + marketClosed，并把刚刷新的纳指并回去。
     */
    @SuppressWarnings("unchecked")
    private static Map<String, Object> mergeZeroCache(Map<String, Object> cache, Map<String, Object> nasdaq) {
        Map<String, Object> cached = new LinkedHashMap<>(cache);
        cached.put("marketClosed", true);
        if (nasdaq != null) {
            Object rawIndices = cached.get("indices");
            List<Map<String, Object>> indices = rawIndices instanceof List<?> list
                    ? new ArrayList<>((List<Map<String, Object>>) list) : new ArrayList<>();
            int nasIdx = -1;
            for (int i = 0; i < indices.size(); i++) {
                Map<String, Object> item = indices.get(i);
                if ("IXIC".equals(item.get("code")) || Boolean.TRUE.equals(item.get("isUS"))) {
                    nasIdx = i;
                    break;
                }
            }
            if (nasIdx >= 0) {
                indices.set(nasIdx, nasdaq);
            } else {
                indices.add(0, nasdaq);
            }
            cached.put("indices", indices);
        }
        return cached;
    }

    // ==================== 纳指 ====================

    private Map<String, Object> fetchNasdaq(Duration timeout) {
        try {
            String raw = get("https://hq.sinajs.cn/list=gb_$ixic", SINA_REFERER, timeout);
            return parseNasdaqLine(raw);
        } catch (Exception error) {
            log.warn("[market] nasdaq fail: {}", error.getMessage());
            return null;
        }
    }

    /** 解析新浪纳指行，返回 {code, price, chgRate, amount, name, isUS}；不可用时返回 null。 */
    private static Map<String, Object> parseNasdaqLine(String raw) {
        Matcher matcher = QUOTED.matcher(raw == null ? "" : raw);
        if (!matcher.find()) {
            return null;
        }
        String[] parts = matcher.group(1).split(",");
        if (parts.length < 6) {
            return null;
        }
        Double price = JsValues.parse(parts[1]);
        if (price == null || !Double.isFinite(price) || price <= 0) {
            return null;
        }
        Double chgRate = JsValues.parse(parts[2]);
        return index("IXIC", price, chgRate == null ? Double.NaN : chgRate, 0d, "纳斯达克", true);
    }

    /** 纳指独立刷新：A 股闭市后仍单独更新纳指（24h 交易）。 */
    private void refreshNasdaqOnly() {
        if (marketCacheData == null) {
            return;
        }
        try {
            String raw = get("https://hq.sinajs.cn/list=gb_$ixic", SINA_REFERER, Duration.ofSeconds(5));
            Matcher matcher = QUOTED.matcher(raw == null ? "" : raw);
            if (!matcher.find()) {
                return;
            }
            String[] parts = matcher.group(1).split(",");
            if (parts.length < 6) {
                return;
            }
            Double priceValue = JsValues.parse(parts[1]);
            if (priceValue == null || !Double.isFinite(priceValue) || priceValue <= 0) {
                return;
            }
            double price = priceValue;
            // 用跌幅反推昨收，防止接口返回为 0
            double prevClose = price / (1 + JsValues.parseOrZero(parts[2]) / 100d);
            Double rawChg = JsValues.parse(parts[2]);
            double chgRate = rawChg == null ? Double.NaN : rawChg;
            if (!Double.isFinite(chgRate)) {
                chgRate = toFixedNumber((price - prevClose) / prevClose * 100d, 2);
            }

            synchronized (this) {
                Map<String, Object> current = marketCacheData;
                if (current == null) {
                    return;
                }
                List<Map<String, Object>> indices = new ArrayList<>((List<Map<String, Object>>) current.get("indices"));
                Map<String, Object> newNas = index("IXIC", price, chgRate, 0d, "纳斯达克", true);
                int nasIdx = -1;
                for (int i = 0; i < indices.size(); i++) {
                    Map<String, Object> item = indices.get(i);
                    if ("IXIC".equals(item.get("code")) || Boolean.TRUE.equals(item.get("isUS"))) {
                        nasIdx = i;
                        break;
                    }
                }
                if (nasIdx >= 0) {
                    indices.set(nasIdx, newNas);
                } else {
                    indices.add(0, newNas);
                }
                Map<String, Object> updated = new LinkedHashMap<>(current);
                updated.put("indices", indices);
                updated.put("updatedAt", System.currentTimeMillis());
                marketCacheData = updated;
                marketCacheTime = System.currentTimeMillis();
                log.info("[market] nasdaq refreshed: {} {}%", price, chgRate);
            }
        } catch (Exception error) {
            log.warn("[market] nasdaq refresh failed: {}", error.getMessage());
        }
    }

    // ==================== 工具 ====================

    private static Map<String, Object> index(String code, Double price, Double chgRate, Double amount,
                                             String name, boolean isUS) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("code", code);
        item.put("price", price);
        item.put("chgRate", chgRate);
        item.put("amount", amount);
        item.put("name", name);
        if (isUS) {
            item.put("isUS", true);
        }
        return item;
    }

    private static Map<String, Object> findIndex(List<Map<String, Object>> indices, String code) {
        for (Map<String, Object> item : indices) {
            if (code.equals(item.get("code"))) {
                return item;
            }
        }
        return null;
    }

    private static long toLong(Object value) {
        return value instanceof Number number ? number.longValue() : 0L;
    }

    /** 等价 JS {@code Number(value.toFixed(digits))}：按 double 精确值四舍五入，NaN 原样返回。 */
    private static double toFixedNumber(double value, int digits) {
        if (!Double.isFinite(value)) {
            return Double.NaN;
        }
        return new BigDecimal(value).setScale(digits, RoundingMode.HALF_UP).doubleValue();
    }

    private String get(String url, String referer, Duration timeout) throws Exception {
        return new String(getBytes(url, referer, timeout), StandardCharsets.UTF_8);
    }

    private byte[] getBytes(String url, String referer, Duration timeout) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .timeout(timeout)
                .header("User-Agent", USER_AGENT)
                .header("Referer", referer == null ? SINA_REFERER : referer)
                .GET()
                .build();
        HttpResponse<byte[]> response = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
        return response.body();
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> readList(String json) {
        try {
            Object parsed = objectMapper.readValue(json, Object.class);
            if (parsed instanceof List<?> list) {
                return objectMapper.convertValue(list, objectMapper.getTypeFactory()
                        .constructCollectionType(List.class, LinkedHashMap.class));
            }
            return null;
        } catch (Exception error) {
            return null;
        }
    }
}
