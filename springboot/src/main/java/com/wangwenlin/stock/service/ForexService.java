package com.wangwenlin.stock.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.config.AppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 汇率（/api/forex/rates）。逐行对齐 Node 端 server.js 11337-11392：
 * 无 KEY 公共接口 fawazahmed0（jsdelivr CDN），本地 .cache/forex.json 缓存 1 天，键名统一大写并只保留受支持币种。
 */
@Service
public class ForexService {

    private static final Logger log = LoggerFactory.getLogger(ForexService.class);

    /** 该接口每天更新一次，缓存 24 小时。 */
    private static final long CACHE_TTL = 24L * 60 * 60 * 1000;

    /** 受支持的计价货币，与前端 CURRENCY_META 保持一致。 */
    private static final List<String> FOREX_SUPPORTED = List.of("CNY", "USD", "EUR", "JPY", "HKD", "GBP");

    private static final String UPSTREAM =
            "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/cny.json";

    private final AppProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public ForexService(AppProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    /** 等价 fetchForexRates：命中缓存直接返回，网络异常退回旧缓存，全失败给 {savedAt:0, rates:{CNY:1}}。 */
    @SuppressWarnings("unchecked")
    public Map<String, Object> fetchRates() {
        Map<String, Object> cached = readCache();
        if (cached != null && cached.get("rates") != null && withinTtl(cached.get("savedAt"))) {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("savedAt", cached.get("savedAt"));
            result.put("rates", normalize(cached.get("rates")));
            return result;
        }
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(UPSTREAM))
                    .timeout(Duration.ofSeconds(10))
                    .header("User-Agent", "Mozilla/5.0")
                    .GET()
                    .build();
            HttpResponse<byte[]> response = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("upstream " + response.statusCode());
            }
            Object parsed = objectMapper.readValue(new String(response.body(), StandardCharsets.UTF_8), Object.class);
            Object cny = parsed instanceof Map<?, ?> map ? map.get("cny") : null;
            Map<String, Object> saved = new LinkedHashMap<>();
            saved.put("savedAt", System.currentTimeMillis());
            saved.put("rates", normalize(cny));
            writeCache(saved);
            return saved;
        } catch (Exception error) {
            log.warn("forex upstream failed: {}", error.getMessage());
            if (cached != null) {
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("savedAt", cached.get("savedAt"));
                result.put("rates", normalize(cached.get("rates")));
                return result;
            }
            Map<String, Object> empty = new LinkedHashMap<>();
            empty.put("savedAt", 0L);
            Map<String, Object> rates = new LinkedHashMap<>();
            rates.put("CNY", 1L);
            empty.put("rates", rates);
            return empty;
        }
    }

    /** 对齐 {@code Date.now() - cached.savedAt < TTL}：savedAt 不是数字时结果是 NaN，条件为假（走重新拉取）。 */
    private static boolean withinTtl(Object savedAt) {
        if (!(savedAt instanceof Number number)) {
            return false;
        }
        return System.currentTimeMillis() - number.longValue() < CACHE_TTL;
    }

    /**
     * 对齐 normalizeForexRates：上游以 CNY 为基准返回小写币种键，这里统一转大写、
     * 只保留受支持币种、过滤非法值（非有限数或 ≤ 0）。
     */
    private static Map<String, Object> normalize(Object source) {
        Map<?, ?> src = source instanceof Map<?, ?> map ? map : Map.of();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("CNY", 1L);
        for (String code : FOREX_SUPPORTED) {
            if ("CNY".equals(code)) {
                continue;
            }
            Object raw = src.get(code.toLowerCase());
            if (raw == null) {
                // 对齐 ?? 语义：仅 null / 缺失时才回退到大写键
                raw = src.get(code);
            }
            Double value = JsValues.parse(raw);
            if (value != null && value > 0) {
                out.put(code, value);
            }
        }
        return out;
    }

    private Path cachePath() {
        String dir = properties.getProjectDir();
        return new java.io.File(dir == null || dir.isBlank() ? ".." : dir).getAbsoluteFile().toPath().normalize()
                .resolve(".cache").resolve("forex.json");
    }

    private Map<String, Object> readCache() {
        try {
            Object parsed = objectMapper.readValue(Files.readString(cachePath(), StandardCharsets.UTF_8), Object.class);
            if (parsed instanceof Map<?, ?> map) {
                Map<String, Object> result = new LinkedHashMap<>();
                for (Map.Entry<?, ?> entry : map.entrySet()) {
                    result.put(String.valueOf(entry.getKey()), entry.getValue());
                }
                return result;
            }
            return null;
        } catch (Exception ignored) {
            return null;
        }
    }

    private void writeCache(Map<String, Object> value) {
        try {
            Path path = cachePath();
            Files.createDirectories(path.getParent());
            Files.writeString(path, objectMapper.writeValueAsString(value), StandardCharsets.UTF_8);
        } catch (Exception ignored) {
            // 对齐 Node：写缓存失败不影响本次返回
        }
    }
}
