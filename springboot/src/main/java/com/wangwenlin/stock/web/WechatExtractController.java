package com.wangwenlin.stock.web;

import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.mapper.WechatEventMapper;
import com.wangwenlin.stock.service.AiCallService;
import com.wangwenlin.stock.service.WechatCategoryService;
import com.wangwenlin.stock.service.WechatExtractService;
import com.wangwenlin.stock.service.WechatTrackingService;
import com.wangwenlin.stock.tenant.UserContext;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartFile;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 微信消息提取相关路由。逐行对齐 server.js 13048-13071、13181-13276、13303-13365。
 */
@RestController
@RequestMapping("/api/wechat")
public class WechatExtractController {

    private static final Pattern JSON_ARRAY = Pattern.compile("\\[[\\s\\S]*\\]");
    private static final Pattern RECOMMEND_DATE = Pattern.compile("^\\d{4}-\\d{1,2}-\\d{1,2}$");
    private static final List<String> VALID_CATEGORIES = List.of("stock_pick", "market_news", "marketing");
    private static final long MAX_IMAGE_BYTES = 10L * 1024 * 1024;

    private static final String IMAGE_SYSTEM_PROMPT =
            "你是A股股票识别助手。请分析图片中的内容，提取所有提到的股票名称和代码。\n"
            + "输出格式为JSON数组，每个元素包含 name（股票名称）和 code（6位股票代码）。\n"
            + "例如：[{\"name\":\"华神科技\",\"code\":\"000790\"},{\"name\":\"双环传动\",\"code\":\"002470\"}]\n"
            + "如果没有识别到股票，返回空数组 []。只输出JSON，不要其他内容。";

    private final WechatExtractService extractService;
    private final WechatCategoryService categoryService;
    private final WechatTrackingService trackingService;
    private final WechatEventMapper eventMapper;
    private final AiCallService aiCallService;

    public WechatExtractController(WechatExtractService extractService,
                                   WechatCategoryService categoryService,
                                   WechatTrackingService trackingService,
                                   WechatEventMapper eventMapper,
                                   AiCallService aiCallService) {
        this.extractService = extractService;
        this.categoryService = categoryService;
        this.trackingService = trackingService;
        this.eventMapper = eventMapper;
        this.aiCallService = aiCallService;
    }

    // ==================== POST /api/wechat/extract ====================

    @PostMapping("/extract")
    public Map<String, Object> extract(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> payload = body == null ? new LinkedHashMap<>() : body;
        String text = WechatExtractService.str(payload.getOrDefault("text", ""));
        String sender = WechatExtractService.str(payload.getOrDefault("sender", ""));
        String chatName = WechatExtractService.str(payload.getOrDefault("chatName", ""));

        if (text.trim().isEmpty()) {
            throw ApiException.badRequest("请先粘贴微信聊天消息");
        }
        if (text.length() > 500000) {
            throw ApiException.badRequest("单次消息不能超过 50 万字符");
        }
        if (extractService.isBlacklisted(sender, chatName, text)) {
            throw new ApiException(403, "命中黑名单，已跳过提取", blocked("命中黑名单，已跳过提取"));
        }
        try {
            Map<String, Object> memHit = categoryService.queryExtractLearn(text);
            Map<String, Object> result = extractService.extractWechatStocks(text, sender, memHit);
            String stocksJson = extractService.toJson(
                    result.get("stocks") == null ? new ArrayList<>() : result.get("stocks"));
            String category = categoryService.categorizeMessageWithLearn(text, stocksJson, memHit);

            Map<String, Object> out = new LinkedHashMap<>(result);
            out.put("category", category);
            if (memHit != null) {
                Map<String, Object> memoryHit = new LinkedHashMap<>();
                memoryHit.put("hit_count", memHit.get("hit_count"));
                memoryHit.put("correct_label", memHit.get("correct_label"));
                memoryHit.put("correct_code", memHit.get("correct_code"));
                out.put("memoryHit", memoryHit);
            } else {
                out.put("memoryHit", null);
            }
            return out;
        } catch (Exception error) {
            throw new ApiException(500, "消息提取失败", twoKeys("消息提取失败", message(error)));
        }
    }

    // ==================== POST /api/wechat/extract-image ====================

    @PostMapping(value = "/extract-image", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> extractImage(@RequestParam(value = "image", required = false) List<MultipartFile> images,
                                            @RequestParam(value = "text", required = false) String textParam,
                                            @RequestParam(value = "sender", required = false) String senderParam,
                                            @RequestParam(value = "chatName", required = false) String chatNameParam) {
        try {
            String textInput = WechatExtractService.str(textParam).trim();
            boolean hasImages = images != null && !images.isEmpty()
                    && images.stream().anyMatch(image -> image != null && !image.isEmpty());
            String sender = WechatExtractService.str(senderParam);
            String chatName = WechatExtractService.str(chatNameParam);

            if (!hasImages && textInput.isEmpty()) {
                throw ApiException.badRequest("请上传图片或输入文字");
            }
            if (!textInput.isEmpty() && extractService.isBlacklisted(sender, chatName, textInput)) {
                throw new ApiException(403, "命中黑名单，已跳过提取", blocked("命中黑名单，已跳过提取"));
            }

            List<String> imagePaths = new ArrayList<>();
            if (hasImages) {
                long userId = UserContext.requireUserId();
                if (images.size() > 10) {
                    throw new ApiException(500, "请求处理失败", singleKey("请求处理失败"));
                }
                for (MultipartFile image : images) {
                    if (image == null || image.isEmpty()) {
                        continue;
                    }
                    String mimeType = WechatExtractService.str(image.getContentType());
                    if (!mimeType.startsWith("image/")) {
                        throw new ApiException(500, "请求处理失败", singleKey("请求处理失败"));
                    }
                    if (image.getSize() > MAX_IMAGE_BYTES) {
                        throw new ApiException(500, "请求处理失败", singleKey("请求处理失败"));
                    }
                    imagePaths.add(trackingService.storeStockImage(userId, image, image.getOriginalFilename()));
                }
            }

            if (!hasImages && !textInput.isEmpty()) {
                Map<String, Object> result = extractService.extractWechatStocks(textInput, "");
                String stocksJson = extractService.toJson(
                        result.get("stocks") == null ? new ArrayList<>() : result.get("stocks"));
                String category = categoryService.categorizeMessageWithLearn(textInput, stocksJson);
                Map<String, Object> out = new LinkedHashMap<>(result);
                out.put("source", "text");
                out.put("category", category);
                return out;
            }

            String userPrompt;
            if (hasImages && !textInput.isEmpty()) {
                userPrompt = "请分析图片中的内容，并结合以下文字说明，提取所有股票名称和代码：\n\n" + textInput;
            } else if (hasImages) {
                userPrompt = "请分析图片中的内容，提取所有股票名称和代码。";
            } else {
                userPrompt = "请分析以下文字内容，提取所有股票名称和代码：\n\n" + textInput;
            }

            String model = hasImages ? "glm-4.6v" : "agnes-2.0-flash";
            String raw;
            if (hasImages && imagePaths.size() > 1) {
                raw = trackingService.callAIMultiImage(IMAGE_SYSTEM_PROMPT, userPrompt, imagePaths, model, 60000, 2000);
            } else {
                String singleImage = imagePaths.isEmpty() ? null : imagePaths.get(0);
                raw = aiCallService.callAI(IMAGE_SYSTEM_PROMPT, userPrompt, singleImage, model, 60000, 2000);
            }

            String rawText = WechatExtractService.str(raw);
            if (rawText.contains("未配置") && rawText.contains("API Key")) {
                throw ApiException.badRequest(rawText);
            }

            Object stocks = new ArrayList<>();
            Matcher matcher = JSON_ARRAY.matcher(rawText);
            if (matcher.find()) {
                try {
                    Object parsed = JSON_MAPPER.readValue(matcher.group(), Object.class);
                    stocks = parsed == null ? new ArrayList<>() : parsed;
                } catch (Exception ignored) {
                    stocks = new ArrayList<>();
                }
            }

            String stocksJson = extractService.toJson(stocks);
            String category = categoryService.categorizeMessageWithLearn(textInput + rawText, stocksJson);

            String detectedSender = "";
            if (!textInput.isEmpty()) {
                Map<String, Object> textExtract = extractService.extractWechatStocks(textInput, "");
                String extractedSender = WechatExtractService.str(textExtract.get("sender"));
                if (!extractedSender.isEmpty() && !"未识别发送人".equals(extractedSender)) {
                    detectedSender = extractedSender;
                }
            }

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("stocks", stocks);
            out.put("rawText", raw);
            out.put("imagePaths", imagePaths);
            out.put("source", hasImages ? "image" : "text");
            out.put("category", category);
            out.put("sender", detectedSender.isEmpty() ? "未识别发送人" : detectedSender);
            return out;
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw new ApiException(500, "提取失败: " + message(error), singleKey("提取失败: " + message(error)));
        }
    }

    /** 等价 multer 抛错后落入 Express 全局兜底的 500「请求处理失败」。 */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, Object>> handleUploadSize() {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(singleKey("请求处理失败"));
    }

    private static final com.fasterxml.jackson.databind.ObjectMapper JSON_MAPPER =
            new com.fasterxml.jackson.databind.ObjectMapper();

    // ==================== POST /api/wechat/extract/save ====================

    @PostMapping("/extract/save")
    public Map<String, Object> extractSave(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> payload = body == null ? new LinkedHashMap<>() : body;
        String text = WechatExtractService.str(payload.getOrDefault("text", ""));
        String sender = WechatExtractService.str(payload.getOrDefault("sender", ""));
        String chatName = WechatExtractService.str(payload.getOrDefault("chatName", ""));
        Object stocksRaw = payload.get("stocks");
        // 与 Node 一致：stocksJson 按请求原文序列化（即使含非对象元素也原样保留）
        List<Object> stocksForJson = stocksRaw instanceof List<?> list ? new ArrayList<>(list) : new ArrayList<>();
        List<Map<String, Object>> stocks = new ArrayList<>();
        for (Object item : stocksForJson) {
            if (item instanceof Map<?, ?> map) {
                Map<String, Object> copy = new LinkedHashMap<>();
                for (Map.Entry<?, ?> entry : map.entrySet()) {
                    copy.put(String.valueOf(entry.getKey()), entry.getValue());
                }
                stocks.add(copy);
            }
        }
        String recommendationDate = WechatExtractService.str(payload.getOrDefault("recommendationDate", ""));
        String categoryInput = WechatExtractService.str(payload.getOrDefault("category", ""));
        boolean forceSave = truthy(payload.get("forceSave"));

        if (text.isEmpty() || text.trim().isEmpty()) {
            throw ApiException.badRequest("消息内容不能为空");
        }

        try {
            String senderCleanRaw = extractService.cleanSender(sender);
            if (senderCleanRaw.isEmpty() || "未识别发送人".equals(senderCleanRaw)) {
                Map<String, Object> autoExtract = extractService.extractWechatStocks(text, "");
                String autoSender = WechatExtractService.str(autoExtract.get("sender"));
                if (!autoSender.isEmpty() && !"未识别发送人".equals(autoSender)) {
                    senderCleanRaw = extractService.cleanSender(autoSender);
                }
            }
            String canonical = extractService.resolveCanonicalInvestorName(senderCleanRaw);
            String senderClean = canonical.isEmpty() ? "未识别发送人" : canonical;
            String chatNameClean = extractService.cleanSender(chatName);

            if (!forceSave && extractService.isBlacklisted(senderClean, chatNameClean, text)) {
                throw new ApiException(403, "命中黑名单，请从黑名单移除后再保存或开启强制保存",
                        blocked("命中黑名单，请从黑名单移除后再保存或开启强制保存"));
            }

            String stocksJson = extractService.toJson(stocksForJson);
            String finalCategory = VALID_CATEGORIES.contains(categoryInput)
                    ? categoryInput
                    : categoryService.categorizeMessageWithLearn(text, stocksJson);
            long now = System.currentTimeMillis();
            String id = "manual-" + now + "-" + WechatExtractService.randomBase36(6);
            String trimmedRecommendation = recommendationDate.trim();
            String messageTime = RECOMMEND_DATE.matcher(trimmedRecommendation).matches()
                    ? trimmedRecommendation
                    : Instant.now().atZone(ZoneOffset.UTC).toLocalDate().toString();

            Map<String, Object> data = new LinkedHashMap<>();
            data.put("id", id);
            data.put("chatName", chatNameClean);
            data.put("sender", senderClean);
            data.put("messageText", text);
            data.put("messageTime", messageTime);
            data.put("capturedAt", messageTime);
            data.put("stocksJson", stocksJson);
            data.put("createdAt", now);
            data.put("category", finalCategory);
            eventMapper.insertManualEvent(data);

            if ("stock_pick".equals(finalCategory)) {
                Map<String, Object> row = eventMapper.findById(id);
                if (row != null) {
                    trackingService.syncTrackingFromEvent(row);
                }
                trackingService.autoRefreshTrackingPrices(id);
            }

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("ok", true);
            out.put("id", id);
            out.put("category", finalCategory);

            if ("stock_pick".equals(finalCategory)) {
                boolean needFill = false;
                for (Map<String, Object> stock : stocks) {
                    if (stock != null && truthy(stock.get("code")) && !truthy(stock.get("logic"))) {
                        needFill = true;
                        break;
                    }
                }
                if (needFill) {
                    trackingService.autoFillStockLogic(id, text, stocks);
                }
            }
            return out;
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw new ApiException(500, message(error), null);
        }
    }

    // ==================== 内部工具 ====================

    private static String message(Exception error) {
        return error.getMessage() == null ? String.valueOf(error) : error.getMessage();
    }

    private static Map<String, Object> singleKey(String message) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("error", message);
        return out;
    }

    private static Map<String, Object> twoKeys(String error, String message) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("error", error);
        if (message != null) {
            out.put("message", message);
        }
        return out;
    }

    private static Map<String, Object> blocked(String error) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("error", error);
        out.put("blocked", true);
        return out;
    }

    private static boolean truthy(Object value) {
        if (value == null) {
            return false;
        }
        if (value instanceof Boolean) {
            return (Boolean) value;
        }
        if (value instanceof Number) {
            return ((Number) value).doubleValue() != 0;
        }
        String text = String.valueOf(value);
        return !text.isEmpty() && !"0".equals(text) && !"false".equals(text);
    }
}
