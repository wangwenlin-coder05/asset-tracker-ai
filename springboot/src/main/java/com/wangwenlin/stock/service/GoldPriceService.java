package com.wangwenlin.stock.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.tenant.UserContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;

/**
 * 国际金价（/api/gold-price）。逐行对齐 Node 端 server.js 10991-11127：
 * 每用户内存缓存 60 秒（?force 可强制刷新），六源顺序回退，全部失败且有缓存时回带 -cached 标记，否则 503。
 */
@Service
public class GoldPriceService {

    private static final Logger log = LoggerFactory.getLogger(GoldPriceService.class);

    /** 1 分钟内复用缓存（防止前端短时多次刷新）。 */
    private static final long CACHE_TTL = 60L * 1000;

    private static final DateTimeFormatter ISO_MILLIS =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);

    private final Map<Long, Map<String, Object>> goldCaches = new LinkedHashMap<>();

    private final AiSettingsService settingsService;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public GoldPriceService(AiSettingsService settingsService, ObjectMapper objectMapper) {
        this.settingsService = settingsService;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(8))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    // ==================== 入口 ====================

    public Map<String, Object> price(boolean forceRefresh) {
        long userId = UserContext.requireUserId();
        Map<String, Object> goldCache = cached(userId);
        long now = System.currentTimeMillis();
        if (!forceRefresh && JsValues.truthy(goldCache.get("price")) && (now - lastFetchAt(goldCache)) < CACHE_TTL) {
            log.info("[GoldPrice] Cache hit, price = {} age = {}s", goldCache.get("price"),
                    Math.round((now - lastFetchAt(goldCache)) / 1000));
            return cachedResponse(goldCache, false);
        }

        String cacheBuster = "_t=" + now;
        String alapiToken = settingsService.getUserSecret("alapi_token");
        Double internationalPrice = null;
        try {
            Map<String, Object> data = asMap(fetchJson("https://api.gold-api.com/price/XAU?" + cacheBuster,
                    null, Duration.ofSeconds(8), true, true));
            if (data != null) {
                Double price = JsValues.parse(data.get("price"));
                if (price != null && price > 0) {
                    internationalPrice = price;
                }
            }
        } catch (Exception error) {
            log.warn("gold-api.com detail failed: {}", error.getMessage());
        }
        Map<String, Object> international = internationalPrice == null ? null
                : Map.of("price", internationalPrice);

        if (JsValues.truthy(alapiToken)) {
            // 源 1：ALAPI 伦敦金 LF
            try {
                Map<String, Object> data = alapiGold(alapiToken, "LF");
                if (isDataArray(data)) {
                    Map<String, Object> gold = findBy((List<?>) data.get("data"), "Au", null);
                    Double price = JsValues.parse(firstThen(gold, "sell_price", "buy_price"));
                    if (price != null && price > 0) {
                        return sendPrice(userId, price, "ALAPI", "LF", 0d, international);
                    }
                }
            } catch (Exception error) {
                log.warn("ALAPI LF failed: {}", error.getMessage());
            }
            // 源 2：ALAPI 上海金 SH
            try {
                Map<String, Object> data = alapiGold(alapiToken, "SH");
                if (isDataArray(data)) {
                    Map<String, Object> gold = findBy((List<?>) data.get("data"), "Au", "黄金");
                    Double price = JsValues.parse(firstThen(gold, "sell_price", "buy_price"));
                    if (price != null && price > 0) {
                        return sendPrice(userId, price, "ALAPI-SH", "SH", 0d, international);
                    }
                }
            } catch (Exception error) {
                log.warn("ALAPI SH failed: {}", error.getMessage());
            }
        }

        // 源 3：freejk
        try {
            Map<String, Object> data = asMap(fetchJson("https://api.freejk.com/shuju/jinjia/?" + cacheBuster,
                    null, Duration.ofSeconds(8), true, false));
            Map<String, Object> row = asMap(firstTruthy(data == null ? null : data.get("data"), data, Map.of()));
            Double price = JsValues.parse(firstThen(row, "price", "AU9999", "au9999"));
            Double london = JsValues.parseOrZero(firstTruthy(row.get("london_gold"), row.get("xauusd"),
                    row.get("international_price"), row.get("usd"), 0));
            if (price != null && price > 0) {
                return sendPrice(userId, price, "freejk", "AU9999", london, international);
            }
        } catch (Exception error) {
            log.warn("freejk failed: {}", error.getMessage());
        }

        // 源 4：xaus
        try {
            Map<String, Object> data = asMap(fetchJson("https://xaus.com/api/v1/spot?currency=CNY&unit=gram&" + cacheBuster,
                    null, Duration.ofSeconds(8), true, false));
            Map<String, Object> xau = data == null ? Map.of() : asMap(data.get("xau"));
            if (xau == null) {
                xau = Map.of();
            }
            Double price = JsValues.parse(firstTruthy(xau.get("price"),
                    data == null ? null : data.get("price_gram_24k"), data == null ? null : data.get("price")));
            Double london = JsValues.parseOrZero(firstTruthy(xau.get("usd_ounce"),
                    data == null ? null : data.get("price_usd_ounce"), 0));
            if (price != null && price > 0) {
                return sendPrice(userId, price, "xaus", "XAU/CNY", london, international);
            }
        } catch (Exception error) {
            log.warn("xaus failed: {}", error.getMessage());
        }

        // 源 5：metalmetric（美元/盎司换算成人民币/克）
        try {
            Map<String, Object> data = asMap(fetchJson("https://metalmetric.com/api/gpt?action=spot_prices&" + cacheBuster,
                    null, Duration.ofSeconds(8), true, false));
            Double usdOunce = JsValues.parse(firstTruthy(data == null ? null : data.get("gold"),
                    data == null ? null : data.get("XAU"), data == null ? null : data.get("price")));
            if (usdOunce != null && usdOunce > 0) {
                double cnyGram = usdOunce * 7.25 / 31.1034768;
                return sendPrice(userId, cnyGram, "metalmetric", "XAU/CNY", usdOunce, international);
            }
        } catch (Exception error) {
            log.warn("metalmetric failed: {}", error.getMessage());
        }

        if (JsValues.truthy(goldCache.get("price"))) {
            log.info("[GoldPrice] All sources failed, return cached price = {}", goldCache.get("price"));
            return cachedResponse(goldCache, true);
        }
        throw new ApiException(503, "gold_price_unavailable");
    }

    // ==================== 回包与缓存 ====================

    private Map<String, Object> sendPrice(long userId, double rawPrice, String source, String market,
                                          Double internationalPriceUsd, Map<String, Object> international) {
        String nowIso = ISO_MILLIS.format(Instant.now().truncatedTo(ChronoUnit.MILLIS));
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("price", round2(rawPrice));
        payload.put("source", source);
        payload.put("market", market);
        payload.put("updatedAt", nowIso);
        payload.put("fetchedAt", nowIso);
        Object fallback = internationalPriceUsd != null && JsValues.truthy(internationalPriceUsd) ? internationalPriceUsd
                : (international == null ? null : international.get("price"));
        payload.put("internationalPriceUsd", JsValues.parseOrZero(fallback));

        Map<String, Object> entry = new LinkedHashMap<>(payload);
        entry.put("lastFetchAt", System.currentTimeMillis());
        synchronized (goldCaches) {
            if (goldCaches.size() > 1000) {
                Iterator<Long> oldest = goldCaches.keySet().iterator();
                if (oldest.hasNext()) {
                    oldest.next();
                    oldest.remove();
                }
            }
            goldCaches.put(userId, entry);
        }
        return payload;
    }

    private static Map<String, Object> cachedResponse(Map<String, Object> goldCache, boolean markCached) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("price", goldCache.get("price"));
        Object source = goldCache.get("source");
        result.put("source", markCached ? JsValues.orEmpty(source) + "-cached" : source);
        result.put("market", goldCache.get("market"));
        result.put("updatedAt", goldCache.get("updatedAt"));
        result.put("fetchedAt", goldCache.get("fetchedAt"));
        result.put("internationalPriceUsd", goldCache.get("internationalPriceUsd"));
        result.put("cached", true);
        return result;
    }

    /** 对齐 {@code goldCaches.get(id) || { price: null, lastFetchAt: 0 }}。 */
    private Map<String, Object> cached(long userId) {
        synchronized (goldCaches) {
            Map<String, Object> found = goldCaches.get(userId);
            if (found != null) {
                return found;
            }
        }
        Map<String, Object> empty = new LinkedHashMap<>();
        empty.put("price", null);
        empty.put("lastFetchAt", 0L);
        return empty;
    }

    private static long lastFetchAt(Map<String, Object> goldCache) {
        Object value = goldCache.get("lastFetchAt");
        return value instanceof Number number ? number.longValue() : 0L;
    }

    /** 对齐 {@code Number(Number(price).toFixed(2))}：exact 值 + HALF_UP 与 JS toFixed 对正数一致。 */
    private static double round2(double rawPrice) {
        return new BigDecimal(rawPrice).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }

    // ==================== 上游请求 ====================

    private Map<String, Object> alapiGold(String token, String market) throws Exception {
        String body = objectMapper.writeValueAsString(Map.of("token", token, "market", market));
        return asMap(fetchJson("https://v3.alapi.cn/api/gold", body, Duration.ofSeconds(8), true, false));
    }

    /** requireOk=true 时对齐 Node 的 {@code if (response.ok)} 前置判断；否则像 Node 一样直接尝试解析 JSON。 */
    private Object fetchJson(String url, String postBody, Duration timeout, boolean noCache, boolean requireOk)
            throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url)).timeout(timeout);
        if (noCache) {
            builder.header("Cache-Control", "no-cache");
        }
        if (postBody == null) {
            builder.GET();
        } else {
            builder.header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(postBody, StandardCharsets.UTF_8));
        }
        HttpResponse<byte[]> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofByteArray());
        if (requireOk && (response.statusCode() < 200 || response.statusCode() >= 300)) {
            throw new IllegalStateException("upstream " + response.statusCode());
        }
        return objectMapper.readValue(new String(response.body(), StandardCharsets.UTF_8), Object.class);
    }

    // ==================== 取值助手 ====================

    /** 对齐 {@code d.symbol === 'Au' || d.name?.includes('黄金') || data[0]}。 */
    private static Map<String, Object> findBy(List<?> list, String symbol, String nameKeyword) {
        Map<String, Object> bySymbol = find(list, item -> symbol.equals(asMap(item) == null ? null : asMap(item).get("symbol")));
        if (bySymbol != null) {
            return bySymbol;
        }
        if (nameKeyword != null) {
            Map<String, Object> byName = find(list, item -> {
                Map<String, Object> map = asMap(item);
                Object name = map == null ? null : map.get("name");
                return name != null && String.valueOf(name).contains(nameKeyword);
            });
            if (byName != null) {
                return byName;
            }
        }
        return list.isEmpty() ? Map.of() : asMap(list.get(0));
    }

    private static Map<String, Object> find(List<?> list, Predicate<Object> predicate) {
        for (Object item : list) {
            if (predicate.test(item)) {
                Map<String, Object> map = asMap(item);
                if (map != null) {
                    return map;
                }
            }
        }
        return null;
    }

    /** 对齐 {@code a?.success && a?.data && Array.isArray(a.data)}。 */
    private static boolean isDataArray(Map<String, Object> data) {
        return data != null && JsValues.truthy(data.get("success")) && data.get("data") instanceof List<?>;
    }

    private static Object firstThen(Map<String, Object> row, String... keys) {
        if (row == null) {
            return null;
        }
        Object[] values = new Object[keys.length];
        for (int i = 0; i < keys.length; i++) {
            values[i] = row.get(keys[i]);
        }
        return firstTruthy(values);
    }

    /** 对齐 {@code a || b || c}：返回第一个真值，全假返回 null。 */
    private static Object firstTruthy(Object... values) {
        for (Object value : values) {
            if (JsValues.truthy(value)) {
                return value;
            }
        }
        return null;
    }

    private static Map<String, Object> asMap(Object value) {
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> result = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                result.put(String.valueOf(entry.getKey()), entry.getValue());
            }
            return result;
        }
        return null;
    }
}
