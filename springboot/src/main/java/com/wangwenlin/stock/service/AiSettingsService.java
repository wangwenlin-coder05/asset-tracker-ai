package com.wangwenlin.stock.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wangwenlin.stock.common.JsStrings;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.common.SecretCrypto;
import com.wangwenlin.stock.mapper.AiSettingsMapper;
import com.wangwenlin.stock.tenant.UserContext;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * AI 设置与模型接入 —— 对齐 Node 端 backend/ai-settings.js + server.js 中模型文档解析 / 厂商模型清单获取。
 */
@Service
public class AiSettingsService {

    /** 对齐 backend/ai-settings.js 的 PROVIDERS（顺序必须一致）。 */
    public static final List<Map<String, Object>> PROVIDERS = List.of(
            provider("glm", "智谱 GLM", "glm_api_key", "https://open.bigmodel.cn", "https://docs.bigmodel.cn"),
            provider("agnes", "Agnes", "agnes_api_key", "https://platform.agnes-ai.com", "https://agnes-ai.com/en/docs/overview"),
            providerWithoutDocs("alapi", "ALAPI 行情", "alapi_token", "https://www.alapi.cn")
    );

    /** 只允许写入真正会被读取的设置项，对齐 FIELDS。 */
    private static final Set<String> FIELDS = Set.of(
            "glm_api_key", "agnes_api_key", "alapi_token", "metaso_api_key", "volcengine_api_key",
            "tavily_api_key", "default_model", "ai_model_routes", "ai_custom_models", "ai_model_catalog",
            "gold_daily_count", "market_fetch_interval", "gold_config", "fee_settings", "stock_fee_presets",
            "stock_metric_tips", "stock_commission_rate", "stock_min_commission", "search_source_order");

    private static final Pattern CUSTOM_KEY_FIELD = Pattern.compile("^custom_[a-z0-9_]{1,48}_api_key$");

    /** 内置厂商接口地址，对齐 AI_BUILTIN_ENDPOINTS。 */
    public static final Map<String, Map<String, Object>> AI_BUILTIN_ENDPOINTS = builtinEndpoints();

    private static final Pattern BASE_URL_LABEL =
            Pattern.compile("Base\\s*URL[^\\n]{0,80}?(https?://[^\\s`\"'<>|\\])]+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern FIRST_URL = Pattern.compile("https?://[^\\s`\"'<>|\\])]+");
    private static final Pattern BASE_URL_TAIL = Pattern.compile("[`\"'<>|\\])]+$");
    private static final Pattern MODEL_BY_LABEL =
            Pattern.compile("模型名称.{0,120}?`([a-zA-Z0-9][a-zA-Z0-9._-]{1,60})`", Pattern.DOTALL);
    private static final Pattern MODEL_JSON =
            Pattern.compile("[\"']model[\"']\\s*:\\s*[\"']([^\"']{2,60})[\"']");
    private static final Pattern TITLE_LINE = Pattern.compile("^\\s*#\\s+(.+)$", Pattern.MULTILINE);
    private static final Pattern CHAT_COMPLETIONS = Pattern.compile("chat/completions", Pattern.CASE_INSENSITIVE);
    private static final Pattern ANTHROPIC_PATH = Pattern.compile("/v1/messages", Pattern.CASE_INSENSITIVE);
    private static final Pattern ANTHROPIC_VERSION = Pattern.compile("anthropic-version", Pattern.CASE_INSENSITIVE);
    private static final Pattern X_API_KEY = Pattern.compile("x-api-key", Pattern.CASE_INSENSITIVE);
    private static final Pattern BEARER_HEADER = Pattern.compile("Authorization\\s*:\\s*Bearer", Pattern.CASE_INSENSITIVE);

    private final AiSettingsMapper settingsMapper;
    private final ObjectMapper objectMapper;

    public AiSettingsService(AiSettingsMapper settingsMapper, ObjectMapper objectMapper) {
        this.settingsMapper = settingsMapper;
        this.objectMapper = objectMapper;
    }

    // ==================== 密钥与自定义模型 ====================

    public String getUserSecret(String field) {
        String stored = settingsMapper.valueOfKey(field);
        if (stored == null || stored.isEmpty()) {
            return "";
        }
        return SecretCrypto.decryptSecret(stored, UserContext.requireUserId(), field);
    }

    /** 读取未解密的原始设置值（等价 Node 端直接查 setting_value，如 ai_model_routes / default_model）。 */
    public String rawValue(String key) {
        return settingsMapper.valueOfKey(key);
    }

    public List<Map<String, Object>> getCustomModels() {
        String raw = settingsMapper.valueOfKey("ai_custom_models");
        if (raw == null || raw.isEmpty()) {
            return new ArrayList<>();
        }
        try {
            Object parsed = objectMapper.readValue(raw, Object.class);
            if (!(parsed instanceof List<?> list)) {
                return new ArrayList<>();
            }
            List<Map<String, Object>> result = new ArrayList<>();
            for (Object item : list) {
                if (item instanceof Map<?, ?> map) {
                    Map<String, Object> copy = new LinkedHashMap<>();
                    for (Map.Entry<?, ?> entry : map.entrySet()) {
                        copy.put(String.valueOf(entry.getKey()), entry.getValue());
                    }
                    result.add(copy);
                }
            }
            return result;
        } catch (Exception ignored) {
            return new ArrayList<>();
        }
    }

    // ==================== 设置读写 ====================

    /** GET /api/ai/settings —— 密钥只回显是否已配置。 */
    public Map<String, Object> getSettings() {
        List<Map<String, Object>> rows = settingsMapper.listAll();
        Map<String, Object> map = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String key = JsValues.toJsString(row.get("setting_key"));
            String value = row.get("setting_value") == null ? null : String.valueOf(row.get("setting_value"));
            if (SecretCrypto.isSecret(key)) {
                map.put(key + "_configured", value != null && !value.isEmpty());
            } else {
                map.put(key, value == null ? "" : value);
            }
        }
        if (JsValues.truthy(map.get("default_model")) == false) {
            map.put("default_model", "agnes-2.5-flash");
        }
        return map;
    }

    /** PUT /api/ai/settings —— 校验后逐项加密/落库。 */
    public void saveSettings(Map<String, Object> settings) {
        if (settings == null) {
            throw new IllegalArgumentException("设置必须是对象");
        }
        for (Map.Entry<String, Object> entry : settings.entrySet()) {
            String field = entry.getKey();
            Object value = entry.getValue();
            if (!FIELDS.contains(field) && !CUSTOM_KEY_FIELD.matcher(field).matches()) {
                throw new IllegalArgumentException("不支持的设置: " + field);
            }
            if (value != null && !(value instanceof String) && !(value instanceof Number)) {
                throw new IllegalArgumentException("设置值必须是字符串或数字");
            }
            if (JsValues.toJsString(JsValues.truthy(value) ? value : "").length() > 16384) {
                throw new IllegalArgumentException("设置值过长");
            }
        }
        long now = System.currentTimeMillis();
        long userId = UserContext.requireUserId();
        for (Map.Entry<String, Object> entry : settings.entrySet()) {
            String field = entry.getKey();
            Object value = entry.getValue();
            boolean secret = SecretCrypto.isSecret(field);
            if (secret && "".equals(value)) {
                continue;
            }
            String stored = secret
                    ? SecretCrypto.encryptSecret(JsValues.toJsString(value), userId, field)
                    : (value == null ? "" : JsValues.toJsString(value));
            settingsMapper.upsert(field, stored, now);
        }
    }

    // ==================== 模型文档解析（规则）====================

    public record ParsedDoc(Map<String, Object> partial, List<String> notes) {
    }

    public ParsedDoc parseModelDocByRules(String text) {
        List<String> notes = new ArrayList<>();
        String baseUrl = "";
        Matcher baseMatch = BASE_URL_LABEL.matcher(text);
        if (baseMatch.find()) {
            baseUrl = baseMatch.group(1);
        }
        if (baseUrl.isEmpty()) {
            Matcher first = FIRST_URL.matcher(text);
            if (first.find()) {
                baseUrl = first.group();
            }
        }
        baseUrl = BASE_URL_TAIL.matcher(baseUrl).replaceFirst("");
        baseUrl = baseUrl.replaceAll("/+$", "");
        if (baseUrl.isEmpty()) {
            notes.add("未识别到 Base URL，请手动填写");
        }

        String modelName = "";
        Matcher byLabel = MODEL_BY_LABEL.matcher(text);
        if (byLabel.find()) {
            modelName = byLabel.group(1);
        }
        List<String> models = new ArrayList<>();
        if (!modelName.isEmpty()) {
            models.add(modelName);
        }
        Matcher modelJson = MODEL_JSON.matcher(text);
        while (modelJson.find()) {
            if (!models.contains(modelJson.group(1))) {
                models.add(modelJson.group(1));
            }
        }
        if (models.isEmpty()) {
            notes.add("未识别到模型名称，请手动填写");
        }

        Matcher titleMatch = TITLE_LINE.matcher(text);
        String name = titleMatch.find() ? JsStrings.trim(titleMatch.group(1)) : "";
        if (name.isEmpty()) {
            name = modelName;
        }

        boolean hasChat = CHAT_COMPLETIONS.matcher(text).find();
        String apiStyle = hasChat ? "openai"
                : (ANTHROPIC_PATH.matcher(text).find() || ANTHROPIC_VERSION.matcher(text).find() ? "anthropic" : "");
        if (!hasChat && "anthropic".equals(apiStyle)) {
            notes.add("文档仅提供 Anthropic Messages 接口，已按该风格接入");
        }
        String authStyle = (X_API_KEY.matcher(text).find() && !BEARER_HEADER.matcher(text).find())
                ? "x-api-key" : "bearer";

        Map<String, Object> partial = new LinkedHashMap<>();
        partial.put("name", name);
        partial.put("baseUrl", baseUrl);
        partial.put("authStyle", authStyle);
        partial.put("apiStyle", apiStyle);
        partial.put("models", models);
        return new ParsedDoc(partial, notes);
    }

    /** 归一化为可持久化的接入配置，对齐 buildModelConfig。 */
    public Map<String, Object> buildModelConfig(Map<String, Object> input) {
        List<String> models = new ArrayList<>();
        if (input.get("models") instanceof List<?> list) {
            for (Object item : list) {
                if (item instanceof String text && !JsStrings.trim(text).isEmpty()) {
                    models.add(JsStrings.trim(text));
                }
            }
        }
        String name = cleanStr(input.get("name"));
        if (name.isEmpty()) {
            name = models.isEmpty() ? "" : models.get(0);
        }
        if (name.isEmpty()) {
            name = "自定义模型";
        }
        String slugSource = models.isEmpty() ? name : models.get(0);
        String slug = slugSource.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "_");
        slug = slug.replaceAll("^_+|_+$", "");
        if (slug.length() > 24) {
            slug = slug.substring(0, 24);
        }
        slug = slug.replaceAll("_+$", "");
        if (slug.isEmpty()) {
            slug = "model";
        }
        String baseUrl = cleanStr(input.get("baseUrl")).replaceAll("/+$", "");
        String apiStyle = "anthropic".equals(cleanStr(input.get("apiStyle"))) ? "anthropic" : "openai";
        String path = cleanStr(input.get("path"));
        if (!path.startsWith("/")) {
            boolean baseHasV1 = Pattern.compile("/v1/?$").matcher(baseUrl).find();
            path = "anthropic".equals(apiStyle)
                    ? (baseHasV1 ? "/messages" : "/v1/messages")
                    : (baseHasV1 ? "/chat/completions" : "/v1/chat/completions");
        }
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("id", "custom-" + slug);
        config.put("name", name);
        config.put("baseUrl", baseUrl);
        config.put("path", path);
        config.put("authStyle", "x-api-key".equals(cleanStr(input.get("authStyle"))) ? "x-api-key" : "bearer");
        config.put("apiStyle", apiStyle);
        config.put("models", models);
        config.put("keyField", "custom_" + slug + "_api_key");
        return config;
    }

    // ==================== 厂商模型清单获取 ====================

    /** 由对话补全路径推导模型清单路径，对齐 deriveModelsPath。 */
    public String deriveModelsPath(String chatPath) {
        String source = chatPath == null ? "" : chatPath;
        String derived = source
                .replaceAll("/chat/completions?$", "/models")
                .replaceAll("/completions?$", "/models");
        if (!derived.isEmpty() && !derived.equals(source)) {
            return derived;
        }
        Matcher versionMatch = Pattern.compile("^/(v\\d+[a-z]*)/", Pattern.CASE_INSENSITIVE).matcher(source);
        return versionMatch.find() ? "/" + versionMatch.group(1) + "/models" : "/models";
    }

    /** 拉取单个厂商模型清单，返回 {ok, models, url} 或 {ok:false, error, url}。 */
    public Map<String, Object> fetchVendorModels(java.net.http.HttpClient httpClient, Map<String, Object> vendor) {
        String baseUrl = cleanStr(vendor.get("baseUrl")).replaceAll("/+$", "");
        if (!Pattern.compile("^https?://", Pattern.CASE_INSENSITIVE).matcher(baseUrl).find()) {
            return fail("未配置有效的 Base URL", null);
        }
        String authStyle = "x-api-key".equals(vendor.get("authStyle")) ? "x-api-key" : "bearer";
        String apiStyle = "anthropic".equals(vendor.get("apiStyle")) ? "anthropic" : "openai";
        String modelsPath = cleanStr(vendor.get("modelsPath"));
        if (modelsPath.isEmpty()) {
            modelsPath = deriveModelsPath(cleanStr(vendor.get("path")).isEmpty() ? "/chat/completions" : cleanStr(vendor.get("path")));
        }
        String key = cleanStr(vendor.get("apiKey"));
        if (key.isEmpty()) {
            return fail("未配置 API Key", null);
        }

        java.net.http.HttpRequest.Builder builder = java.net.http.HttpRequest.newBuilder(
                        java.net.URI.create(baseUrl + (modelsPath.startsWith("/") ? modelsPath : "/" + modelsPath)))
                .timeout(java.time.Duration.ofSeconds(20))
                .GET();
        if ("x-api-key".equals(authStyle)) {
            builder.header("x-api-key", key);
        } else {
            builder.header("Authorization", "Bearer " + key);
        }
        if ("anthropic".equals(apiStyle)) {
            builder.header("anthropic-version", "2023-06-01");
        }
        String url = baseUrl + (modelsPath.startsWith("/") ? modelsPath : "/" + modelsPath);
        try {
            java.net.http.HttpResponse<String> response =
                    httpClient.send(builder.build(), java.net.http.HttpResponse.BodyHandlers.ofString(java.nio.charset.StandardCharsets.UTF_8));
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                String errText = response.body();
                String hint = (response.statusCode() == 401 || response.statusCode() == 403)
                        ? "（API Key 无效或已过期）" : "";
                String tail = errText == null || errText.isEmpty() ? "" : "：" + errText.substring(0, Math.min(160, errText.length()));
                return fail("接口返回" + response.statusCode() + hint + tail, url);
            }
            Object parsed = objectMapper.readValue(response.body(), Object.class);
            List<?> raw = new ArrayList<>();
            if (parsed instanceof List<?> list) {
                raw = list;
            } else if (parsed instanceof Map<?, ?> map) {
                Object data = map.get("data");
                if (data instanceof List<?> dataList) {
                    raw = dataList;
                } else if (map.get("models") instanceof List<?> modelsList) {
                    raw = modelsList;
                }
            }
            Set<String> models = new LinkedHashSet<>();
            for (Object item : raw) {
                String value;
                if (item instanceof String text) {
                    value = JsStrings.trim(text);
                } else if (item instanceof Map<?, ?> map) {
                    Object id = map.containsKey("id") ? map.get("id") : (map.containsKey("name") ? map.get("name") : map.get("model"));
                    value = id == null ? "" : JsStrings.trim(JsValues.toJsString(id));
                } else {
                    value = "";
                }
                if (!value.isEmpty()) {
                    models.add(value);
                }
            }
            if (models.isEmpty()) {
                return fail("接口未返回可识别的模型列表", url);
            }
            Map<String, Object> ok = new LinkedHashMap<>();
            ok.put("ok", true);
            ok.put("models", new ArrayList<>(models));
            ok.put("url", url);
            return ok;
        } catch (java.net.http.HttpTimeoutException timeout) {
            return fail("请求超时，请检查 Base URL 是否可达", url);
        } catch (Exception error) {
            return fail(error.getMessage() == null ? "请求失败" : error.getMessage(), url);
        }
    }

    private static Map<String, Object> fail(String error, String url) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", false);
        result.put("error", error);
        if (url != null) {
            result.put("url", url);
        }
        return result;
    }

    // ==================== 内部工具 ====================

    private static String cleanStr(Object value) {
        return JsStrings.trim(value instanceof String text ? text : "");
    }

    private static Map<String, Object> provider(String id, String name, String keyField, String website, String docs) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", id);
        map.put("name", name);
        map.put("keyField", keyField);
        map.put("website", website);
        map.put("docs", docs);
        map.put("billing", "user");
        return map;
    }

    private static Map<String, Object> providerWithoutDocs(String id, String name, String keyField, String website) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", id);
        map.put("name", name);
        map.put("keyField", keyField);
        map.put("website", website);
        map.put("billing", "user");
        return map;
    }

    private static Map<String, Map<String, Object>> builtinEndpoints() {
        Map<String, Map<String, Object>> map = new LinkedHashMap<>();
        Map<String, Object> glm = new LinkedHashMap<>();
        glm.put("name", "智谱 GLM");
        glm.put("keyField", "glm_api_key");
        glm.put("baseUrl", "https://open.bigmodel.cn/api/paas/v4");
        glm.put("path", "/chat/completions");
        glm.put("authStyle", "bearer");
        glm.put("apiStyle", "openai");
        map.put("glm", glm);
        Map<String, Object> agnes = new LinkedHashMap<>();
        agnes.put("name", "Agnes");
        agnes.put("keyField", "agnes_api_key");
        agnes.put("baseUrl", "https://apihub.agnes-ai.com/v1");
        agnes.put("path", "/chat/completions");
        agnes.put("authStyle", "bearer");
        agnes.put("apiStyle", "openai");
        map.put("agnes", agnes);
        return map;
    }
}
