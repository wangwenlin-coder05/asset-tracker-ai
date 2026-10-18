package com.wangwenlin.stock.service;

import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.common.JsStrings;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.mapper.AiArticleMapper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

/**
 * AI 创作工作台：文章 CRUD —— 对齐 Node 端 server.js 中 /api/ai/articles 系列 5 个路由。
 */
@Service
public class AiArticleService {

    /** 排序白名单，键与值必须与 Node 端 sortMap 一致。 */
    private static final Map<String, String> SORT_MAP = Map.of(
            "-created_at", "created_at DESC",
            "created_at", "created_at ASC",
            "-updated_at", "updated_at DESC",
            "updated_at", "updated_at ASC",
            "-word_count", "word_count DESC",
            "word_count", "word_count ASC",
            "title", "title ASC"
    );

    /** 入参键 → Mapper 参数名（与 AiArticleMapper.xml 的 update 分支一一对应）。 */
    private static final Map<String, String> COL_MAP = Map.ofEntries(
            Map.entry("category", "category"),
            Map.entry("title", "title"),
            Map.entry("content", "content"),
            Map.entry("plain_text", "plainText"),
            Map.entry("word_count", "wordCount"),
            Map.entry("source", "source"),
            Map.entry("source_url", "sourceUrl"),
            Map.entry("sourceUrl", "sourceUrl"),
            Map.entry("tags", "tags"),
            Map.entry("status", "status"),
            Map.entry("platform", "platform")
    );

    private static final List<String> ALLOWED = List.of(
            "category", "title", "content", "plain_text", "word_count",
            "source", "source_url", "sourceUrl", "tags", "status", "platform");

    private final AiArticleMapper articleMapper;

    public AiArticleService(AiArticleMapper articleMapper) {
        this.articleMapper = articleMapper;
    }

    // ==================== POST /api/ai/articles ====================

    public Map<String, Object> create(Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        String id = "aia_" + System.currentTimeMillis() + "_" + randomBase36(6);
        long now = System.currentTimeMillis();
        String cat = firstNonEmptyString(b.get("category"), "综合");
        String title = firstNonEmptyString(b.get("title"), "无标题");
        String content = firstNonEmptyString(b.get("content"), "");
        String plainText = firstNonEmptyString(b.get("plain_text"), "");

        String rawForCount = !plainText.isEmpty() ? plainText : (!content.isEmpty() ? content : "");
        Double wordCountInput = MarketDataService.number(b.get("word_count"));
        Object wordCount = (wordCountInput != null && wordCountInput > 0)
                ? wordCountInput
                : (long) JsStrings.countNonWhitespaceCodePoints(rawForCount);

        String tagsVal;
        if (b.get("tags") instanceof List<?> list) {
            List<String> parts = new ArrayList<>();
            for (Object item : list) {
                parts.add(JsValues.toJsString(item));
            }
            tagsVal = String.join(",", parts);
        } else {
            tagsVal = JsValues.truthy(b.get("tags")) ? JsValues.toJsString(b.get("tags")) : "";
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", id);
        data.put("category", cat);
        data.put("title", title);
        data.put("content", content);
        data.put("plainText", plainText);
        data.put("wordCount", wordCount);
        data.put("source", firstNonEmptyString(b.get("source"), ""));
        data.put("sourceUrl", JsValues.truthy(b.get("source_url"))
                ? JsValues.toJsString(b.get("source_url"))
                : (JsValues.truthy(b.get("sourceUrl")) ? JsValues.toJsString(b.get("sourceUrl")) : ""));
        data.put("tags", tagsVal);
        data.put("status", firstNonEmptyString(b.get("status"), "draft"));
        data.put("platform", firstNonEmptyString(b.get("platform"), ""));
        data.put("createdAt", now);
        data.put("updatedAt", now);
        articleMapper.insert(data);

        Map<String, Object> inner = new LinkedHashMap<>();
        inner.put("id", id);
        inner.put("category", cat);
        inner.put("title", title);
        inner.put("word_count", wordCount);
        inner.put("wordCount", wordCount);
        inner.put("created_at", now);
        inner.put("createdAt", now);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("id", id);
        result.put("data", inner);
        return result;
    }

    // ==================== GET /api/ai/articles ====================

    public Map<String, Object> list(String q, String category, String status, int limit, int offset, String sort) {
        Map<String, Object> params = new LinkedHashMap<>();
        if (category != null && !category.isEmpty()) {
            params.put("category", category);
        }
        if (status != null && !status.isEmpty()) {
            params.put("status", status);
        }
        if (q != null && !q.isEmpty()) {
            params.put("qLike", "%" + q + "%");
        }

        long total = articleMapper.count(params);
        String orderBy = SORT_MAP.getOrDefault(sort, SORT_MAP.get("-created_at"));

        Map<String, Object> listParams = new LinkedHashMap<>(params);
        listParams.put("orderBy", orderBy);
        listParams.put("pageSize", limit);
        listParams.put("offset", offset);
        List<Map<String, Object>> rows = articleMapper.list(listParams);

        List<Object> categories = new ArrayList<>();
        for (String item : articleMapper.distinctCategories()) {
            if (item != null && !item.isEmpty()) {
                categories.add(item);
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("data", rows);
        result.put("total", total);
        result.put("categories", categories);
        return result;
    }

    // ==================== GET /api/ai/articles/{id} ====================

    public Map<String, Object> detail(String id) {
        Map<String, Object> row = articleMapper.findById(id);
        if (row == null) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("success", false);
            body.put("error", "未找到");
            throw new ApiException(404, "未找到", body);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("id", row.get("id"));
        result.put("data", row);
        for (Map.Entry<String, Object> entry : row.entrySet()) {
            result.put(entry.getKey(), entry.getValue());
        }
        return result;
    }

    // ==================== PUT /api/ai/articles/{id} ====================

    public Map<String, Object> update(String id, Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        Map<String, Object> data = new LinkedHashMap<>();
        for (String key : ALLOWED) {
            if (!b.containsKey(key)) {
                continue;
            }
            Object value = b.get(key);
            if ("tags".equals(key) && value instanceof List<?> list) {
                List<String> parts = new ArrayList<>();
                for (Object item : list) {
                    parts.add(JsValues.toJsString(item));
                }
                value = String.join(",", parts);
            }
            // 按列名落库；sourceUrl 与 source_url 同列，后者覆盖前者
            data.put(COL_MAP.get(key), value);
        }

        boolean wcExplicit = b.containsKey("word_count");
        if (!wcExplicit && (b.containsKey("plain_text") || b.containsKey("content"))) {
            Object raw = b.containsKey("plain_text") ? b.get("plain_text") : b.get("content");
            String rawText = raw == null ? "" : JsValues.toJsString(raw);
            data.put("wordCount", JsStrings.countNonWhitespaceCodePoints(rawText));
        }

        if (data.isEmpty()) {
            return simpleSuccess();
        }
        data.put("id", id);
        data.put("updatedAt", System.currentTimeMillis());
        articleMapper.update(data);
        return simpleSuccess();
    }

    // ==================== DELETE /api/ai/articles/{id} ====================

    public Map<String, Object> delete(String id) {
        Integer affected = articleMapper.deleteById(id);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("affectedRows", affected);
        return result;
    }

    // ==================== 内部工具 ====================

    private static Map<String, Object> simpleSuccess() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        return result;
    }

    private static String firstNonEmptyString(Object value, String fallback) {
        return JsValues.truthy(value) ? JsValues.toJsString(value) : fallback;
    }

    /** 等价 Math.random().toString(36).slice(2)，取 length 个 [0-9a-z] 字符。 */
    private static String randomBase36(int length) {
        char[] table = "0123456789abcdefghijklmnopqrstuvwxyz".toCharArray();
        StringBuilder builder = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            builder.append(table[ThreadLocalRandom.current().nextInt(table.length)]);
        }
        return builder.toString();
    }
}
