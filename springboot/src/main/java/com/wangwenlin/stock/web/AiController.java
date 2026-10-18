package com.wangwenlin.stock.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.common.JsStrings;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.service.AiArticleService;
import com.wangwenlin.stock.service.AiCallService;
import com.wangwenlin.stock.service.AiChartService;
import com.wangwenlin.stock.service.AiHotService;
import com.wangwenlin.stock.service.AiSettingsService;
import com.wangwenlin.stock.service.SearchSourceService;
import com.wangwenlin.stock.service.UploadService;
import com.wangwenlin.stock.tenant.UserContext;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * AI 链路 REST 接口 —— 与 Node 端 server.js 中的同名路由逐字节对齐。
 * 覆盖：联网检索源清单、AI 提问、热榜聚合、网页正文解析、文章 CRUD、设置读写、
 * 模型文档解析、厂商模型清单、调用统计/日志、厂商清单、AI 视频生成与图表分析。
 */
@RestController
public class AiController {

    private static final List<String> ALLOWED_LEVELS = List.of("警戒", "危险", "危机");

    private final AiSettingsService settingsService;
    private final AiCallService callService;
    private final AiHotService hotService;
    private final AiArticleService articleService;
    private final AiChartService chartService;
    private final SearchSourceService searchSourceService;
    private final UploadService uploadService;
    private final ObjectMapper objectMapper;

    public AiController(AiSettingsService settingsService,
                        AiCallService callService,
                        AiHotService hotService,
                        AiArticleService articleService,
                        AiChartService chartService,
                        SearchSourceService searchSourceService,
                        UploadService uploadService,
                        ObjectMapper objectMapper) {
        this.settingsService = settingsService;
        this.callService = callService;
        this.hotService = hotService;
        this.articleService = articleService;
        this.chartService = chartService;
        this.searchSourceService = searchSourceService;
        this.uploadService = uploadService;
        this.objectMapper = objectMapper;
    }

    // ==================== 联网检索源清单 ====================

    @GetMapping("/api/search/sources")
    public Map<String, Object> searchSources() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("sources", searchSourceService.getSourceOrder());
        return body;
    }

    // ==================== AI 提问 ====================

    @PostMapping("/api/ai/ask")
    public Map<String, Object> ask(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        String question = JsStrings.trim(JsValues.truthy(b.get("question"))
                ? JsValues.toJsString(b.get("question")) : "");
        if (question.isEmpty() || question.length() > 4000) {
            throw new ApiException(400, "问题不能为空且不能超过 4000 字");
        }
        String model = "agnes-2.5-flash";
        String routesRaw = settingsService.rawValue("ai_model_routes");
        try {
            Object parsed = objectMapper.readValue(routesRaw == null || routesRaw.isEmpty() ? "{}" : routesRaw, Object.class);
            if (parsed instanceof Map<?, ?> map) {
                Object assistant = map.get("assistant");
                if (JsValues.truthy(assistant)) {
                    model = JsValues.toJsString(assistant);
                }
            }
        } catch (Exception ignored) {
            // 与 Node 端一致：解析失败保持默认模型
        }
        try {
            String answer = callService.callAI(
                    "你是一个耐心、谨慎的投研软件助手。解释功能和概念时使用通俗中文；涉及个股和交易时明确说明不构成投资建议，不预测确定收益。",
                    question, null, model, 45000, 1200);
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("answer", answer);
            result.put("model", model);
            return result;
        } catch (Exception error) {
            String message = error.getMessage() == null ? "AI 暂时不可用" : error.getMessage();
            throw new ApiException(500, message);
        }
    }

    // ==================== 热榜聚合 ====================

    @GetMapping("/api/ai/hot/platforms")
    public Map<String, Object> hotPlatforms() {
        try {
            return hotService.platforms();
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw fail(error, true);
        }
    }

    @GetMapping("/api/ai/hot")
    public Map<String, Object> hot(@RequestParam(value = "platform", required = false) String platform) {
        try {
            return hotService.hot(platform);
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw fail(error, true);
        }
    }

    @GetMapping("/api/ai/hot/batch")
    public Map<String, Object> hotBatch(@RequestParam(value = "platforms", required = false) String platforms) {
        try {
            return hotService.hotBatch(platforms);
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw fail(error, true);
        }
    }

    @GetMapping("/api/ai/article-parse")
    public Map<String, Object> articleParse(@RequestParam(value = "url", required = false) String url) {
        try {
            return hotService.articleParse(url);
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw fail(error, true);
        }
    }

    // ==================== 文章 CRUD ====================

    @PostMapping("/api/ai/articles")
    public Map<String, Object> createArticle(@RequestBody(required = false) Map<String, Object> body) {
        try {
            return articleService.create(body);
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw fail(error, true);
        }
    }

    @GetMapping("/api/ai/articles")
    public Map<String, Object> listArticles(@RequestParam Map<String, String> query) {
        try {
            String q = firstTruthy(query.get("q"), query.get("keyword"));
            String category = query.getOrDefault("category", "");
            String status = query.getOrDefault("status", "");
            String sort = query.getOrDefault("sort", "-created_at");
            Long pageRaw = JsValues.parseIntOrNull(query.get("page") == null ? "" : query.get("page"));
            Long sizeRaw = JsValues.parseIntOrNull(query.get("pageSize") == null ? "" : query.get("pageSize"));
            long page = (pageRaw == null || pageRaw == 0) ? 1 : pageRaw;
            long pageSize = (sizeRaw == null || sizeRaw == 0) ? 20 : sizeRaw;
            int limit = (int) pageSize;
            int offset = (int) ((page - 1) * pageSize);
            Map<String, Object> result = articleService.list(q, category, status, limit, offset, sort);
            result.put("page", page);
            result.put("pageSize", pageSize);
            return result;
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw fail(error, true);
        }
    }

    @GetMapping("/api/ai/articles/{id}")
    public Map<String, Object> articleDetail(@PathVariable("id") String id) {
        try {
            return articleService.detail(id);
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw fail(error, true);
        }
    }

    @PutMapping("/api/ai/articles/{id}")
    public Map<String, Object> updateArticle(@PathVariable("id") String id,
                                             @RequestBody(required = false) Map<String, Object> body) {
        try {
            return articleService.update(id, body);
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw fail(error, true);
        }
    }

    @DeleteMapping("/api/ai/articles/{id}")
    public Map<String, Object> deleteArticle(@PathVariable("id") String id) {
        try {
            return articleService.delete(id);
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw fail(error, true);
        }
    }

    // ==================== 设置读写 ====================

    @GetMapping("/api/ai/settings")
    public Map<String, Object> getSettings() {
        try {
            return settingsService.getSettings();
        } catch (Exception error) {
            throw new ApiException(500, "获取失败");
        }
    }

    @PutMapping("/api/ai/settings")
    public Map<String, Object> saveSettings(@RequestBody(required = false) Map<String, Object> body) {
        try {
            settingsService.saveSettings(body);
            if (body != null && body.get("search_source_order") != null) {
                searchSourceService.setSourceOrder(searchSourceService.parseSourceOrder(body.get("search_source_order")));
            }
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("ok", true);
            return result;
        } catch (Exception error) {
            throw new ApiException(500, "保存失败");
        }
    }

    @PostMapping("/api/ai/test-model")
    public Map<String, Object> testModel(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        try {
            Object modelValue = b.get("model");
            if (!JsValues.truthy(modelValue)) {
                throw new ApiException(400, "请指定模型");
            }
            if (!(modelValue instanceof String)) {
                throw new ApiException(500, "不支持的模型，请选择官网模型");
            }
            Map<String, Object> subset = new LinkedHashMap<>();
            for (String key : List.of("glm_api_key", "agnes_api_key")) {
                if (b.containsKey(key)) {
                    subset.put(key, b.get(key));
                }
            }
            settingsService.saveSettings(subset);
            String result = callService.callAI("你是一个测试助手。", "请回复\"模型测试成功\"四个字。", null,
                    (String) modelValue, 30000, 500);
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("result", result);
            response.put("model", modelValue);
            return response;
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw new ApiException(500, error.getMessage());
        }
    }

    // ==================== 粘贴模型文档自动接入 ====================

    @PostMapping("/api/ai/parse-model-doc")
    public Map<String, Object> parseModelDoc(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        Object rawText = b.get("text");
        String text = rawText instanceof String str
                ? JsStrings.trim(str.length() > 60000 ? str.substring(0, 60000) : str)
                : "";
        if (text.isEmpty()) {
            throw new ApiException(400, "请粘贴模型文档内容");
        }
        try {
            AiSettingsService.ParsedDoc parsed = settingsService.parseModelDocByRules(text);
            List<String> notes = parsed.notes();
            String source = "rule";
            try {
                String aiModel = settingsService.rawValue("default_model");
                if (aiModel == null || aiModel.isEmpty()) {
                    aiModel = "agnes-2.5-flash";
                }
                Map<String, Object> guess = extractModelConfigByAI(text, aiModel);
                Map<String, Object> merged = new LinkedHashMap<>();
                merged.put("name", pick(guess.get("name"), parsed.partial().get("name")));
                merged.put("baseUrl", pick(guess.get("baseUrl"), parsed.partial().get("baseUrl")));
                merged.put("path", pick(guess.get("path"), ""));
                merged.put("authStyle", pick(guess.get("authStyle"), parsed.partial().get("authStyle")));
                merged.put("apiStyle", pick(guess.get("apiStyle"), parsed.partial().get("apiStyle")));
                merged.put("models", pick(guess.get("models"), parsed.partial().get("models")));
                Object guessNotes = guess.get("notes");
                if (guessNotes instanceof String noteText && !JsStrings.trim(noteText).isEmpty()) {
                    notes.add(JsStrings.trim(noteText));
                }
                source = "ai";
                return parseDocResponse(source, merged, notes);
            } catch (Exception error) {
                notes.add("AI 解析不可用，已使用规则解析（" + (error.getMessage() == null ? "" : error.getMessage()) + "）");
            }
            return parseDocResponse(source, parsed.partial(), notes);
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw new ApiException(500, error.getMessage());
        }
    }

    private Map<String, Object> parseDocResponse(String source, Map<String, Object> input, List<String> notes) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("source", source);
        body.put("config", settingsService.buildModelConfig(input));
        body.put("notes", notes);
        return body;
    }

    private Map<String, Object> extractModelConfigByAI(String text, String model) throws Exception {
        String system = "你是大模型 API 接入配置解析器。用户会粘贴某厂商的官方 API 文档文本，请阅读后只输出一个 JSON 对象，不要 markdown 代码块、不要任何解释文字。\n"
                + "JSON 字段：\n"
                + "{\"name\":\"模型展示名称\",\"baseUrl\":\"API Base URL（例如 https://apihub.agnes-ai.com/v1）\",\"path\":\"对话补全接口路径（以 / 开头，例如 /chat/completions）\",\"authStyle\":\"bearer 或 x-api-key\",\"apiStyle\":\"openai 或 anthropic\",\"models\":[\"模型ID数组\"],\"notes\":\"一句话中文说明\"}\n"
                + "优先采用文档中的 Chat Completions（OpenAI 兼容）接口；若文档只有 Messages（Anthropic 兼容）接口，则 apiStyle 填 anthropic、path 填 /messages 或 /v1/messages。无法确定的字段填空字符串或空数组。";
        String content = callService.callAI(system, "文档内容：\n" + text, null, model, 45000, 1500);
        int start = content.indexOf('{');
        int end = content.lastIndexOf('}');
        if (start < 0 || end <= start) {
            throw new IllegalStateException("AI 未返回有效 JSON");
        }
        Object parsed = objectMapper.readValue(content.substring(start, end + 1), Object.class);
        if (!(parsed instanceof Map<?, ?> map)) {
            throw new IllegalStateException("AI 返回结构无效");
        }
        Map<String, Object> result = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            result.put(String.valueOf(entry.getKey()), entry.getValue());
        }
        return result;
    }

    /** 等价 Node 端 pick(preferred, fallback)。 */
    private static Object pick(Object preferred, Object fallback) {
        if (preferred instanceof List<?> list) {
            return list.isEmpty() ? fallback : preferred;
        }
        if (preferred instanceof String text && !JsStrings.trim(text).isEmpty()) {
            return preferred;
        }
        return fallback;
    }

    // ==================== 厂商模型清单 ====================

    @PostMapping("/api/ai/models/fetch")
    public Map<String, Object> fetchModels(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        try {
            String providerKey = JsValues.toJsString(JsValues.orEmptyValue(b.get("provider")));
            Map<String, Object> builtin = AiSettingsService.AI_BUILTIN_ENDPOINTS.get(providerKey);
            Map<String, Object> vendor = new LinkedHashMap<>();
            if (builtin != null) {
                vendor.putAll(builtin);
                vendor.put("apiKey", settingsService.getUserSecret(String.valueOf(builtin.get("keyField"))));
            } else {
                vendor.put("baseUrl", b.get("baseUrl"));
                vendor.put("path", b.get("path"));
                vendor.put("modelsPath", b.get("modelsPath"));
                vendor.put("authStyle", b.get("authStyle"));
                vendor.put("apiStyle", b.get("apiStyle"));
                vendor.put("apiKey", b.get("apiKey") instanceof String text ? JsStrings.trim(text) : "");
            }
            if (builtin == null) {
                String keyField = JsValues.toJsString(JsValues.orEmptyValue(b.get("keyField")));
                if (JsValues.toJsString(vendor.get("apiKey")).isEmpty()
                        && keyField.matches("^custom_[a-z0-9_]{1,48}_api_key$")) {
                    vendor.put("apiKey", settingsService.getUserSecret(keyField));
                }
                if (JsValues.toJsString(vendor.get("apiKey")).isEmpty()) {
                    throw new ApiException(400, "请先填写该厂商的 API Key");
                }
            }
            Map<String, Object> result = settingsService.fetchVendorModels(callService.httpClient(), vendor);
            if (!Boolean.TRUE.equals(result.get("ok"))) {
                Map<String, Object> fail = new LinkedHashMap<>();
                fail.put("error", "获取模型列表失败：" + result.get("error"));
                if (result.get("url") != null) {
                    fail.put("url", result.get("url"));
                }
                throw new ApiException(502, String.valueOf(fail.get("error")), fail);
            }
            Map<String, Object> ok = new LinkedHashMap<>();
            ok.put("ok", true);
            ok.put("url", result.get("url"));
            ok.put("models", result.get("models"));
            return ok;
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw new ApiException(500, error.getMessage() == null ? "获取失败" : error.getMessage());
        }
    }

    @PostMapping("/api/ai/models/fetch-all")
    public Map<String, Object> fetchAllModels() {
        try {
            List<Map<String, Object>> groups = new ArrayList<>();
            for (Map.Entry<String, Map<String, Object>> entry : AiSettingsService.AI_BUILTIN_ENDPOINTS.entrySet()) {
                String id = entry.getKey();
                if ("alapi".equals(id)) {
                    continue;
                }
                Map<String, Object> endpoint = entry.getValue();
                String keyField = String.valueOf(endpoint.get("keyField"));
                String apiKey = settingsService.getUserSecret(keyField);
                boolean configured = !apiKey.isEmpty();
                Map<String, Object> result = configured
                        ? settingsService.fetchVendorModels(callService.httpClient(), withKey(endpoint, apiKey))
                        : Map.of("ok", false, "error", "未配置 API Key");
                groups.add(group(id, String.valueOf(endpoint.get("name")), "builtin", keyField, configured, result));
            }
            for (Map<String, Object> item : settingsService.getCustomModels()) {
                String keyField = item.get("keyField") == null ? "" : String.valueOf(item.get("keyField"));
                String apiKey = keyField.isEmpty() ? "" : settingsService.getUserSecret(keyField);
                boolean configured = !apiKey.isEmpty();
                Map<String, Object> result = configured
                        ? settingsService.fetchVendorModels(callService.httpClient(), withKey(item, apiKey))
                        : Map.of("ok", false, "error", "未配置 API Key");
                String id = item.get("id") == null ? "" : String.valueOf(item.get("id"));
                String name = item.get("name") == null || String.valueOf(item.get("name")).isEmpty()
                        ? id : String.valueOf(item.get("name"));
                groups.add(group(id, name, "custom", keyField, configured, result));
            }
            int totalModels = 0;
            for (Map<String, Object> group : groups) {
                totalModels += ((List<?>) group.get("models")).size();
            }
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("ok", true);
            body.put("groups", groups);
            body.put("totalModels", totalModels);
            return body;
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw new ApiException(500, error.getMessage() == null ? "获取失败" : error.getMessage());
        }
    }

    private static Map<String, Object> withKey(Map<String, Object> source, String apiKey) {
        Map<String, Object> copy = new LinkedHashMap<>(source);
        copy.put("apiKey", apiKey);
        return copy;
    }

    private static Map<String, Object> group(String id, String name, String kind, String keyField,
                                             boolean configured, Map<String, Object> result) {
        boolean ok = Boolean.TRUE.equals(result.get("ok"));
        Map<String, Object> group = new LinkedHashMap<>();
        group.put("id", id);
        group.put("name", name);
        group.put("kind", kind);
        group.put("keyField", keyField);
        group.put("configured", configured);
        group.put("ok", ok);
        group.put("models", ok ? result.get("models") : new ArrayList<>());
        group.put("error", ok ? "" : result.get("error"));
        return group;
    }

    // ==================== 调用统计与日志 ====================

    @GetMapping("/api/ai/usage")
    public Map<String, Object> usage() {
        try {
            return callService.usage();
        } catch (Exception error) {
            throw new ApiException(500, error.getMessage());
        }
    }

    @GetMapping("/api/ai/logs")
    public Map<String, Object> logs(@RequestParam(value = "limit", required = false) String limitParam,
                                    @RequestParam(value = "offset", required = false) String offsetParam) {
        try {
            Long limitRaw = JsValues.parseIntOrNull(limitParam == null ? "" : limitParam);
            long limitValue = (limitRaw == null || limitRaw == 0) ? 50 : limitRaw;
            int limit = (int) Math.min(limitValue, 200);
            Long offsetRaw = JsValues.parseIntOrNull(offsetParam == null ? "" : offsetParam);
            long offsetValue = (offsetRaw == null || offsetRaw == 0) ? 0 : offsetRaw;
            int offset = (int) Math.max(offsetValue, 0);
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("logs", callService.listLogs(limit, offset));
            body.put("total", callService.logTotal());
            return body;
        } catch (Exception error) {
            throw new ApiException(500, error.getMessage());
        }
    }

    @PostMapping("/api/ai/logs")
    public Map<String, Object> writeLog(@RequestBody(required = false) Map<String, Object> body) {
        try {
            return callService.writeAiLog(body);
        } catch (Exception error) {
            throw fail(error, true);
        }
    }

    // ==================== 厂商清单 ====================

    @GetMapping("/api/ai/providers")
    public List<Map<String, Object>> providers() {
        return AiSettingsService.PROVIDERS;
    }

    // ==================== AI 视频 ====================

    @PostMapping("/api/ai/videos/generate")
    public Map<String, Object> generateVideo(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        try {
            Object promptValue = b.get("prompt");
            String prompt = JsValues.toJsString(JsValues.orEmptyValue(promptValue));
            String level = JsValues.toJsString(JsValues.orEmptyValue(b.get("level")));
            if (JsStrings.trim(prompt).isEmpty()) {
                throw new ApiException(400, "请输入视频描述");
            }
            if (!ALLOWED_LEVELS.contains(level)) {
                throw new ApiException(400, "视频档位无效");
            }
            String apiKey = settingsService.getUserSecret("glm_api_key");
            if (apiKey.isEmpty()) {
                throw new ApiException(400, "未配置智谱 API Key");
            }
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("model", "cogvideox-flash");
            String trimmed = JsStrings.trim(prompt);
            payload.put("prompt", trimmed.length() > 512 ? trimmed.substring(0, 512) : trimmed);
            payload.put("size", "1024x1024");
            payload.put("fps", 30);

            var request = java.net.http.HttpRequest.newBuilder(
                            java.net.URI.create("https://open.bigmodel.cn/api/paas/v4/videos/generations"))
                    .timeout(Duration.ofSeconds(60))
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .POST(java.net.http.HttpRequest.BodyPublishers.ofString(
                            objectMapper.writeValueAsString(payload), StandardCharsets.UTF_8))
                    .build();
            var response = callService.httpClient().send(request, java.net.http.HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("视频 API 请求失败 (" + response.statusCode() + "): "
                        + new String(response.body(), StandardCharsets.UTF_8));
            }
            Object data = objectMapper.readValue(response.body(), Object.class);
            Object taskId = null;
            if (data instanceof Map<?, ?> map) {
                taskId = map.get("id") != null ? map.get("id") : map.get("request_id");
            }
            if (taskId == null) {
                throw new IllegalStateException("视频 API 未返回任务 ID");
            }
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("taskId", taskId);
            result.put("level", level);
            return result;
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw new ApiException(500, error.getMessage());
        }
    }

    @GetMapping("/api/ai/videos/status/{id}")
    public Map<String, Object> videoStatus(@PathVariable("id") String id,
                                           @RequestParam(value = "level", required = false) String level) {
        try {
            if (!ALLOWED_LEVELS.contains(level)) {
                throw new ApiException(400, "视频档位无效");
            }
            String apiKey = settingsService.getUserSecret("glm_api_key");
            if (apiKey.isEmpty()) {
                throw new ApiException(400, "未配置智谱 API Key");
            }
            String encoded = URLEncoder.encode(id, StandardCharsets.UTF_8).replace("+", "%20");
            var request = java.net.http.HttpRequest.newBuilder(
                            java.net.URI.create("https://open.bigmodel.cn/api/paas/v4/async-result/" + encoded))
                    .timeout(Duration.ofSeconds(30))
                    .header("Authorization", "Bearer " + apiKey)
                    .GET()
                    .build();
            var response = callService.httpClient().send(request, java.net.http.HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("查询视频任务失败 (" + response.statusCode() + "): "
                        + new String(response.body(), StandardCharsets.UTF_8));
            }
            Object data = objectMapper.readValue(response.body(), Object.class);
            String status = "PROCESSING";
            String videoUrl = null;
            if (data instanceof Map<?, ?> map) {
                if (JsValues.truthy(map.get("task_status"))) {
                    status = JsValues.toJsString(map.get("task_status"));
                }
                Object results = map.get("video_result");
                if (results instanceof List<?> list && !list.isEmpty() && list.get(0) instanceof Map<?, ?> first) {
                    Object url = first.get("url");
                    videoUrl = url == null ? null : JsValues.toJsString(url);
                }
            }
            if (!"SUCCESS".equals(status)) {
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("status", status);
                return result;
            }
            if (videoUrl == null || !videoUrl.startsWith("https://")) {
                throw new IllegalStateException("视频任务未返回有效地址");
            }
            var videoRequest = java.net.http.HttpRequest.newBuilder(java.net.URI.create(videoUrl))
                    .timeout(Duration.ofSeconds(120))
                    .GET()
                    .build();
            var videoResponse = callService.httpClient().send(videoRequest,
                    java.net.http.HttpResponse.BodyHandlers.ofByteArray());
            if (videoResponse.statusCode() < 200 || videoResponse.statusCode() >= 300) {
                throw new IllegalStateException("下载生成视频失败");
            }
            byte[] buffer = videoResponse.body();
            if (buffer.length > 100 * 1024 * 1024) {
                throw new IllegalStateException("生成视频文件过大");
            }
            Map<String, String> levelFileMap = Map.of("警戒", "1.mp4", "危险", "2.mp4", "危机", "3.mp4");
            String filename = levelFileMap.get(level);
            Path directory = uploadService.ensureTenantDir(UserContext.requireUserId(), "movie");
            Files.write(directory.resolve(filename), buffer);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("status", "SUCCESS");
            result.put("videoPath", "uploads/movie/" + filename);
            return result;
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw new ApiException(500, error.getMessage());
        }
    }

    // ==================== 图表分析 ====================

    @GetMapping("/api/ai/charts")
    public Map<String, Object> charts(@RequestParam(value = "code", required = false) String code) {
        return chartService.charts(code);
    }

    // ==================== 内部工具 ====================

    private static String firstTruthy(String first, String second) {
        if (JsValues.truthy(first)) {
            return first;
        }
        return JsValues.truthy(second) ? second : "";
    }

    private static ApiException fail(Exception error, boolean withSuccess) {
        String message = error.getMessage() == null ? String.valueOf(error) : error.getMessage();
        Map<String, Object> body = new LinkedHashMap<>();
        if (withSuccess) {
            body.put("success", false);
        }
        body.put("error", message);
        return new ApiException(500, message, body);
    }
}
