package com.wangwenlin.stock.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wangwenlin.stock.common.JsStrings;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.mapper.AiLogMapper;
import com.wangwenlin.stock.tenant.UserContext;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 通用 AI 调用 —— 与 Node 端 server.js 的 prepModel / callAI / callAIChatWithTools 逐行对齐。
 * 每次调用都会写入 ai_logs（成功再加 ai_usage），失败信息与 Node 端保持一致。
 */
@Service
public class AiCallService {

    private static final Pattern BUILTIN_MODEL = Pattern.compile("^(?:agnes$|agnes-|glm-)");
    private static final Pattern V_SUFFIX = Pattern.compile("v(?:-|$)");
    private static final DateTimeFormatter UTC_DATE =
            DateTimeFormatter.ofPattern("yyyy-MM-dd").withZone(ZoneOffset.UTC);

    private final AiSettingsService settingsService;
    private final AiLogMapper logMapper;
    private final UploadService uploadService;
    private final ObjectMapper objectMapper;
    private final java.net.http.HttpClient httpClient;

    public AiCallService(AiSettingsService settingsService,
                         AiLogMapper logMapper,
                         UploadService uploadService,
                         ObjectMapper objectMapper) {
        this.settingsService = settingsService;
        this.logMapper = logMapper;
        this.uploadService = uploadService;
        this.objectMapper = objectMapper;
        this.httpClient = java.net.http.HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(15))
                .followRedirects(java.net.http.HttpClient.Redirect.NORMAL)
                .build();
    }

    public java.net.http.HttpClient httpClient() {
        return httpClient;
    }

    // ==================== 模型解析 ====================

    public Map<String, Object> findCustomModel(String model) {
        for (Map<String, Object> item : settingsService.getCustomModels()) {
            Object id = item.get("id");
            if (id != null && id.equals(model)) {
                return item;
            }
            Object models = item.get("models");
            if (models instanceof List<?> list && list.contains(model)) {
                return item;
            }
        }
        return null;
    }

    public record PreparedModel(Map<String, Object> custom,
                                boolean isGlm,
                                boolean isAgnes,
                                String provider,
                                String providerName,
                                String apiKey,
                                String resolvedModel,
                                Map<String, Object> config) {
    }

    /** 等价 Node 端 prepareModel，非法模型直接抛错。 */
    public PreparedModel prepareModel(String model) {
        if (model == null || model.isEmpty() || model.length() > 200) {
            throw new IllegalArgumentException("不支持的模型，请选择官网模型");
        }
        Map<String, Object> custom = findCustomModel(model);
        boolean isBuiltin = custom == null && BUILTIN_MODEL.matcher(model).find();
        if (custom == null && !isBuiltin) {
            throw new IllegalArgumentException("不支持的模型，请在设置中接入该模型");
        }

        boolean isGlm = custom == null && model.startsWith("glm-");
        boolean isAgnes = custom == null && ("agnes".equals(model) || model.startsWith("agnes-"));
        String provider = custom != null ? firstNonEmpty(custom.get("id"), "custom") : (isGlm ? "glm" : "agnes");
        String providerName = custom != null
                ? firstNonEmpty(custom.get("name"), model)
                : ("agnes".equals(provider) ? "Agnes" : ("glm".equals(provider) ? "智谱GLM" : provider));
        Object keyFieldRaw = custom != null ? custom.get("keyField") : provider + "_api_key";
        String keyField = keyFieldRaw == null ? "" : String.valueOf(keyFieldRaw);
        String apiKey = settingsService.getUserSecret(keyField);
        String resolvedModel = "agnes".equals(model) ? "agnes-2.5-flash" : model;

        Map<String, Object> config = new LinkedHashMap<>();
        if (custom != null) {
            String baseUrl = str(custom.get("baseUrl")).replaceAll("/+$", "");
            String path = firstNonEmpty(custom.get("path"), "/chat/completions");
            config.put("url", baseUrl + (path.startsWith("/") ? path : "/" + path));
            config.put("model", resolvedModel);
            config.put("authStyle", "x-api-key".equals(custom.get("authStyle")) ? "x-api-key" : "bearer");
            config.put("apiStyle", "anthropic".equals(custom.get("apiStyle")) ? "anthropic" : "openai");
        } else {
            config.put("url", isAgnes
                    ? "https://apihub.agnes-ai.com/v1/chat/completions"
                    : "https://open.bigmodel.cn/api/paas/v4/chat/completions");
            config.put("model", resolvedModel);
            config.put("authStyle", "bearer");
            config.put("apiStyle", "openai");
        }
        return new PreparedModel(custom, isGlm, isAgnes, provider, providerName, apiKey, resolvedModel, config);
    }

    // ==================== 带工具调用（单轮）====================

    /** 等价 callAIChatWithTools。返回 {message} / {error} / {unsupported}。 */
    public Map<String, Object> callAIChatWithTools(String model, List<Map<String, Object>> messages,
                                                    List<Map<String, Object>> tools,
                                                    int timeoutMs, int maxTokens) throws Exception {
        PreparedModel prepared = prepareModel(model);
        if (prepared.apiKey() == null || prepared.apiKey().isEmpty()) {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("error", "未配置 " + prepared.providerName() + " API Key");
            return result;
        }
        if (!"openai".equals(prepared.config().get("apiStyle"))) {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("unsupported", true);
            return result;
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("model", prepared.config().get("model"));
        payload.put("messages", messages);
        payload.put("tools", tools);
        payload.put("tool_choice", "auto");
        payload.put("temperature", 0.2);
        payload.put("max_tokens", maxTokens);
        if (prepared.isGlm()) {
            payload.put("thinking", Map.of("type", "disabled"));
        }

        java.net.http.HttpRequest.Builder builder = java.net.http.HttpRequest.newBuilder(
                        java.net.URI.create(String.valueOf(prepared.config().get("url"))))
                .timeout(Duration.ofMillis(timeoutMs))
                .header("Content-Type", "application/json");
        if ("x-api-key".equals(prepared.config().get("authStyle"))) {
            builder.header("x-api-key", prepared.apiKey());
        } else {
            builder.header("Authorization", "Bearer " + prepared.apiKey());
        }
        builder.POST(java.net.http.HttpRequest.BodyPublishers.ofString(
                objectMapper.writeValueAsString(payload), java.nio.charset.StandardCharsets.UTF_8));

        var response = httpClient.send(builder.build(), java.net.http.HttpResponse.BodyHandlers.ofByteArray());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            String errText = new String(response.body(), java.nio.charset.StandardCharsets.UTF_8);
            throw new IllegalStateException("AI API 请求失败 (" + response.statusCode() + "): "
                    + errText.substring(0, Math.min(200, errText.length())));
        }
        Object data = objectMapper.readValue(response.body(), Object.class);
        Map<String, Object> message = new LinkedHashMap<>();
        if (data instanceof Map<?, ?> map && map.get("choices") instanceof List<?> choices && !choices.isEmpty()
                && choices.get(0) instanceof Map<?, ?> choice && choice.get("message") instanceof Map<?, ?> msg) {
            for (Map.Entry<?, ?> entry : msg.entrySet()) {
                message.put(String.valueOf(entry.getKey()), entry.getValue());
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", message);
        return result;
    }

    // ==================== 主调用 ====================

    public String callAI(String systemPrompt, String userPrompt, String imagePath, String model,
                         int timeoutMs, int maxTokens) throws Exception {
        long startTime = System.currentTimeMillis();
        PreparedModel prepared = prepareModel(model);
        String provider = prepared.provider();
        String providerName = prepared.providerName();
        String apiKey = prepared.apiKey();
        String resolvedModel = prepared.resolvedModel();
        Map<String, Object> config = prepared.config();

        if (apiKey == null || apiKey.isEmpty()) {
            String msg = "⚠️ 未配置 " + providerName + " API Key，请在设置中配置。";
            Map<String, Object> data = baseLog(model, provider, systemPrompt, userPrompt);
            data.put("responseLen", 0);
            data.put("durationMs", System.currentTimeMillis() - startTime);
            data.put("success", 0);
            data.put("errorMsg", msg);
            data.put("requestContent", "[系统提示] " + systemPrompt + "\n\n[用户输入] " + userPrompt);
            safeInsertLog(data);
            return msg;
        }

        boolean isGlm = prepared.isGlm();
        if (imagePath != null && !imagePath.isEmpty() && isGlm
                && !V_SUFFIX.matcher(model).find() && !model.contains("thinking-flash")) {
            config.put("model", "glm-4.6v-flash");
        }

        List<Map<String, Object>> messages = new ArrayList<>();
        messages.add(message("system", systemPrompt, null));

        boolean hasImage = false;
        if (imagePath != null && imagePath.startsWith("uploads/")) {
            Path fullPath = uploadService.resolveTenantPath(UserContext.requireUserId(), imagePath);
            if (Files.exists(fullPath)) {
                byte[] imageBytes = Files.readAllBytes(fullPath);
                String ext = extension(imagePath);
                String mimeType = switch (ext) {
                    case ".jpg", ".jpeg" -> "image/jpeg";
                    case ".png" -> "image/png";
                    case ".gif" -> "image/gif";
                    case ".webp" -> "image/webp";
                    default -> "image/jpeg";
                };
                String dataUrl = "data:" + mimeType + ";base64," + Base64.getEncoder().encodeToString(imageBytes);
                messages.add(message("user", null, List.of(
                        Map.of("type", "text", "text", userPrompt),
                        Map.of("type", "image_url", "image_url", Map.of("url", dataUrl)))));
                hasImage = true;
            } else {
                messages.add(message("user", userPrompt, null));
            }
        } else {
            messages.add(message("user", userPrompt, null));
        }

        String content = "";
        boolean success = true;
        String errorMsg = "";
        String requestContent = "";
        try {
            requestContent = "[系统提示] " + systemPrompt + "\n\n[用户输入] " + userPrompt;
            if (imagePath != null && imagePath.startsWith("uploads/")) {
                requestContent += "\n[图片] " + imagePath;
            }
            boolean isAnthropic = "anthropic".equals(config.get("apiStyle"));
            Map<String, Object> payload = new LinkedHashMap<>();
            if (isAnthropic) {
                payload.put("model", config.get("model"));
                payload.put("system", systemPrompt);
                List<Map<String, Object>> filtered = new ArrayList<>();
                for (Map<String, Object> item : messages) {
                    if (!"system".equals(item.get("role"))) {
                        filtered.add(item);
                    }
                }
                payload.put("messages", filtered);
                payload.put("max_tokens", maxTokens);
            } else {
                payload.put("model", config.get("model"));
                payload.put("messages", messages);
                payload.put("temperature", 0.2);
                payload.put("max_tokens", maxTokens);
                if (isGlm) {
                    payload.put("thinking", Map.of("type", "disabled"));
                }
            }

            java.net.http.HttpRequest.Builder builder = java.net.http.HttpRequest.newBuilder(
                            java.net.URI.create(String.valueOf(config.get("url"))))
                    .timeout(Duration.ofMillis(timeoutMs))
                    .header("Content-Type", "application/json");
            if ("x-api-key".equals(config.get("authStyle"))) {
                builder.header("x-api-key", apiKey);
            } else {
                builder.header("Authorization", "Bearer " + apiKey);
            }
            if (isAnthropic) {
                builder.header("anthropic-version", "2023-06-01");
            }
            builder.POST(java.net.http.HttpRequest.BodyPublishers.ofString(
                    objectMapper.writeValueAsString(payload), java.nio.charset.StandardCharsets.UTF_8));

            var response = httpClient.send(builder.build(), java.net.http.HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                String errText = new String(response.body(), java.nio.charset.StandardCharsets.UTF_8);
                throw new IllegalStateException("AI API 请求失败 (" + response.statusCode() + "): " + errText);
            }
            Object data = objectMapper.readValue(response.body(), Object.class);
            if (isAnthropic) {
                content = anthropicContent(data);
            } else {
                content = openaiContent(data);
            }
        } catch (Exception error) {
            success = false;
            errorMsg = error.getMessage() == null ? String.valueOf(error) : error.getMessage();
            throw error;
        } finally {
            long duration = System.currentTimeMillis() - startTime;
            Map<String, Object> data = baseLog(resolvedModel, provider, systemPrompt, userPrompt);
            data.put("responseLen", content == null ? 0 : content.length());
            data.put("durationMs", duration);
            data.put("success", success ? 1 : 0);
            data.put("errorMsg", errorMsg);
            data.put("requestContent", truncate(requestContent, 2000));
            data.put("responseContent", truncate(content == null ? "" : content, 2000));
            safeInsertLog(data);

            if (success) {
                try {
                    logMapper.upsertUsage(utcToday(), resolvedModel);
                } catch (Exception ignored) {
                    // 统计失败不影响主流程
                }
            }
        }

        return content;
    }

    // ==================== 日志写入（供 /api/ai/logs 路由复用）====================

    /** 等价 POST /api/ai/logs：内部服务回传日志。 */
    public Map<String, Object> writeAiLog(Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        String model = firstSlice(b.get("model"), "", 64);
        String provider = firstSlice(b.get("provider"), "quant", 32);
        int success = Boolean.FALSE.equals(b.get("success")) ? 0 : 1;

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("model", model);
        data.put("provider", provider);
        data.put("systemPromptLen", (int) JsValues.parseOrZero(b.get("system_prompt_len")));
        data.put("userPromptLen", (int) JsValues.parseOrZero(b.get("user_prompt_len")));
        data.put("responseLen", (int) JsValues.parseOrZero(b.get("response_len")));
        data.put("durationMs", (int) JsValues.parseOrZero(b.get("duration_ms")));
        data.put("success", success);
        data.put("errorMsg", b.get("error_msg") == null ? "" : String.valueOf(b.get("error_msg")));
        data.put("requestContent", truncate(b.get("request_content") == null ? "" : String.valueOf(b.get("request_content")), 2000));
        data.put("responseContent", truncate(b.get("response_content") == null ? "" : String.valueOf(b.get("response_content")), 2000));
        logMapper.insertLog(data);
        if (success != 0) {
            logMapper.upsertUsage(utcToday(), model);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        return result;
    }

    public List<Map<String, Object>> listLogs(int limit, int offset) {
        return logMapper.list(limit, offset);
    }

    public long logTotal() {
        return logMapper.countAll();
    }

    public Map<String, Object> usage() {
        String today = utcToday();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("date", today);
        result.put("total", logMapper.countSuccess());
        result.put("today", logMapper.countSuccessOnDate(today));

        List<Map<String, Object>> byModel = new ArrayList<>();
        for (Map<String, Object> row : logMapper.successByModelOnDate(today)) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("model", row.get("model"));
            item.put("count", row.get("count"));
            byModel.add(item);
        }
        result.put("byModel", byModel);

        List<Map<String, Object>> rows = logMapper.successTrend();
        List<Map<String, Object>> trend = new ArrayList<>();
        ZonedDateTime now = ZonedDateTime.now(ZoneOffset.UTC);
        for (int i = 6; i >= 0; i--) {
            String dateStr = UTC_DATE.format(now.minusDays(i));
            Object count = 0;
            for (Map<String, Object> row : rows) {
                if (dateStr.equals(String.valueOf(row.get("date")))) {
                    count = row.get("count");
                    break;
                }
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("date", dateStr);
            item.put("count", count);
            trend.add(item);
        }
        result.put("trend", trend);
        return result;
    }

    // ==================== 内部工具 ====================

    private static Map<String, Object> message(String role, String text, Object content) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("role", role);
        if (content != null) {
            map.put("content", content);
        } else {
            map.put("content", text);
        }
        return map;
    }

    private static Map<String, Object> baseLog(String model, String provider, String systemPrompt, String userPrompt) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("model", model);
        data.put("provider", provider);
        data.put("systemPromptLen", systemPrompt == null ? 0 : systemPrompt.length());
        data.put("userPromptLen", userPrompt == null ? 0 : userPrompt.length());
        return data;
    }

    private void safeInsertLog(Map<String, Object> data) {
        try {
            logMapper.insertLog(data);
        } catch (Exception ignored) {
            // 日志记录失败不影响主流程
        }
    }

    /** 对齐数组拦截语义：非数组 → null；数组 → 各元素 text 拼接（皆空则占位）。 */
    private static String anthropicContent(Object data) {
        if (data instanceof Map<?, ?> map) {
            Object content = map.get("content");
            if (content instanceof List<?> list) {
                StringBuilder builder = new StringBuilder();
                for (Object item : list) {
                    if (item instanceof Map<?, ?> block && block.get("text") != null) {
                        builder.append(String.valueOf(block.get("text")));
                    }
                }
                return builder.isEmpty() ? "AI 未返回有效结果" : builder.toString();
            }
            return content == null ? "AI 未返回有效结果" : String.valueOf(content);
        }
        return "AI 未返回有效结果";
    }

    private static String openaiContent(Object data) {
        if (!(data instanceof Map<?, ?> map)) {
            return "AI 未返回有效结果";
        }
        Object choices = map.get("choices");
        Object message = null;
        if (choices instanceof List<?> list && !list.isEmpty() && list.get(0) instanceof Map<?, ?> first) {
            message = first.get("message");
        }
        if (!(message instanceof Map<?, ?> msg)) {
            return "AI 未返回有效结果";
        }
        Object content = msg.get("content");
        boolean blank = content == null || (content instanceof String text && JsStrings.trim(text).isEmpty());
        if (blank && msg.get("reasoning_content") != null) {
            content = msg.get("reasoning_content");
        }
        if (content instanceof List<?> list) {
            StringBuilder builder = new StringBuilder();
            for (Object item : list) {
                if (item instanceof Map<?, ?> block && block.get("text") != null) {
                    builder.append(String.valueOf(block.get("text")));
                }
            }
            return builder.isEmpty() ? "AI 未返回有效结果" : builder.toString();
        }
        if (content == null || (content instanceof String text && text.isEmpty())) {
            return "AI 未返回有效结果";
        }
        return String.valueOf(content);
    }

    /** 等价 Node 端 truncate(str, maxLen)。 */
    static String truncate(String value, int maxLen) {
        String s = value == null ? "" : value;
        if (s.isEmpty()) {
            return "";
        }
        if (s.length() > maxLen) {
            return s.substring(0, maxLen) + "\n...(已截断, 共" + s.length() + "字符)";
        }
        return s;
    }

    private static String extension(String imagePath) {
        int index = imagePath.lastIndexOf('.');
        return index < 0 ? "" : imagePath.substring(index).toLowerCase(Locale.ROOT);
    }

    private static String firstNonEmpty(Object value, String fallback) {
        String text = value == null ? "" : String.valueOf(value);
        return text.isEmpty() ? fallback : text;
    }

    private static String str(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private static String firstSlice(Object value, String fallback, int maxLength) {
        String text = value == null || String.valueOf(value).isEmpty() ? fallback : String.valueOf(value);
        return text.length() > maxLength ? text.substring(0, maxLength) : text;
    }

    private static String utcToday() {
        return UTC_DATE.format(ZonedDateTime.now(ZoneOffset.UTC));
    }
}
