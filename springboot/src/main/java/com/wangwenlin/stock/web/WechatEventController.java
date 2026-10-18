package com.wangwenlin.stock.web;

import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.mapper.WechatEventMapper;
import com.wangwenlin.stock.mapper.WechatTrackingMapper;
import com.wangwenlin.stock.service.WechatCategoryService;
import com.wangwenlin.stock.service.WechatExtractService;
import com.wangwenlin.stock.service.WechatMonitorState;
import com.wangwenlin.stock.service.WechatTrackingService;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 微信事件（消息）相关路由。逐行对齐 server.js 12766-12913、13368-13669。
 */
@RestController
@RequestMapping("/api/wechat")
public class WechatEventController {

    private static final Pattern SIX_DIGITS = Pattern.compile("^\\d{6}$");
    private static final Pattern MODULE_DATE = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");
    private static final DateTimeFormatter MYSQL_DT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final List<String> VALID_CATEGORIES = List.of("stock_pick", "market_news", "marketing");

    private final WechatEventMapper eventMapper;
    private final WechatTrackingMapper trackingMapper;
    private final WechatExtractService extractService;
    private final WechatCategoryService categoryService;
    private final WechatTrackingService trackingService;
    private final WechatMonitorState monitorState;

    public WechatEventController(WechatEventMapper eventMapper,
                                 WechatTrackingMapper trackingMapper,
                                 WechatExtractService extractService,
                                 WechatCategoryService categoryService,
                                 WechatTrackingService trackingService,
                                 WechatMonitorState monitorState) {
        this.eventMapper = eventMapper;
        this.trackingMapper = trackingMapper;
        this.extractService = extractService;
        this.categoryService = categoryService;
        this.trackingService = trackingService;
        this.monitorState = monitorState;
    }

    // ==================== GET /api/wechat/events/:id/stocks-usage ====================

    @GetMapping("/events/{id}/stocks-usage")
    public Map<String, Object> stocksUsage(@PathVariable("id") String id) {
        Map<String, Object> row = eventMapper.findStocksUsageRow(id);
        if (row == null) {
            throw new ApiException(404, "消息不存在", null);
        }
        String category = WechatExtractService.str(row.get("category"));
        boolean isStockPick = "stock_pick".equals(category);
        List<Map<String, Object>> stocks = extractService.parseJsonList(
                WechatExtractService.str(row.get("stocks_json")));

        List<Map<String, Object>> validStocks = new ArrayList<>();
        for (Map<String, Object> stock : stocks) {
            if (stock != null && stock.get("code") != null && !WechatExtractService.str(stock.get("code")).isEmpty()) {
                validStocks.add(stock);
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        if (validStocks.isEmpty()) {
            out.put("stocks", new ArrayList<>());
            out.put("isStockPick", isStockPick);
            return out;
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> stock : validStocks) {
            String code = WechatExtractService.str(stock.get("code")).trim();
            String trackingId = id + "_" + code;
            List<Map<String, Object>> rows = trackingMapper.listIdsByStockCode(code);
            int otherCount = 0;
            for (Map<String, Object> trackingRow : rows) {
                if (!trackingId.equals(WechatExtractService.str(trackingRow.get("id")))) {
                    otherCount++;
                }
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("code", code);
            item.put("name", stock.get("name") == null ? "" : stock.get("name"));
            item.put("trackingId", trackingId);
            item.put("count", rows.size());
            item.put("otherCount", otherCount);
            result.add(item);
        }
        out.put("stocks", result);
        out.put("isStockPick", isStockPick);
        return out;
    }

    // ==================== POST /api/wechat/events/:id/delete ====================

    @PostMapping("/events/{id}/delete")
    @Transactional
    public Map<String, Object> deleteEventWithOptions(@PathVariable("id") String id,
                                                      @RequestBody(required = false) Map<String, Object> body) {
        try {
            List<Map<String, Object>> trackingRows = trackingMapper.listByEventId(id);

            Map<String, Boolean> optMap = new LinkedHashMap<>();
            Object optionsRaw = body == null ? null : body.get("stockOptions");
            if (optionsRaw instanceof List<?> options) {
                for (Object option : options) {
                    if (option instanceof Map<?, ?> opt && opt.get("code") != null) {
                        optMap.put(WechatExtractService.str(opt.get("code")).trim(), truthy(opt.get("deleteAll")));
                    }
                }
            }

            for (Map<String, Object> tracking : trackingRows) {
                String stockCode = WechatExtractService.str(tracking.get("stock_code"));
                String trackingId = WechatExtractService.str(tracking.get("id"));
                Boolean deleteAll = optMap.get(stockCode);
                if (Boolean.TRUE.equals(deleteAll)) {
                    for (Map<String, Object> row : trackingMapper.listIdsByStockCode(stockCode)) {
                        trackingMapper.deleteDailyByTrackingId(WechatExtractService.str(row.get("id")));
                    }
                    trackingMapper.deleteByStockCode(stockCode);
                } else {
                    trackingMapper.deleteDailyByTrackingId(trackingId);
                    trackingMapper.deleteById(trackingId);
                }
            }

            Map<String, Object> result = extractService.deleteWechatEvent(id);
            if (!truthy(result.get("deleted"))) {
                throw new ApiException(404, "消息不存在", null);
            }
            Map<String, Object> out = new LinkedHashMap<>(result);
            out.put("trackingDeleted", trackingRows.size());
            return out;
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw new ApiException(500, message(error), null);
        }
    }

    // ==================== DELETE /api/wechat/events/:id ====================

    @DeleteMapping("/events/{id}")
    @Transactional
    public Map<String, Object> deleteEvent(@PathVariable("id") String id) {
        try {
            List<Map<String, Object>> trackingRows = trackingMapper.listByEventId(id);
            for (Map<String, Object> tracking : trackingRows) {
                String stockCode = WechatExtractService.str(tracking.get("stock_code"));
                String trackingId = WechatExtractService.str(tracking.get("id"));
                int otherCount = trackingMapper.countOtherRefs(stockCode, id);
                if (otherCount > 0) {
                    trackingMapper.deleteDailyByTrackingId(trackingId);
                    trackingMapper.deleteById(trackingId);
                } else {
                    for (Map<String, Object> row : trackingMapper.listIdsByStockCode(stockCode)) {
                        trackingMapper.deleteDailyByTrackingId(WechatExtractService.str(row.get("id")));
                    }
                    trackingMapper.deleteByStockCode(stockCode);
                }
            }

            Map<String, Object> result = extractService.deleteWechatEvent(id);
            if (!truthy(result.get("deleted"))) {
                throw new ApiException(404, "消息不存在", null);
            }
            return result;
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw new ApiException(500, message(error), null);
        }
    }

    // ==================== DELETE /api/wechat/events ====================

    @DeleteMapping("/events")
    @Transactional
    public Map<String, Object> deleteEvents(@RequestParam(value = "category", required = false) String category) {
        try {
            if (category != null && !category.isEmpty()) {
                List<Map<String, Object>> events = eventMapper.listIdsByCategory(category);
                List<String> ids = new ArrayList<>();
                for (Map<String, Object> row : events) {
                    ids.add(WechatExtractService.str(row.get("id")));
                }
                if (!ids.isEmpty()) {
                    List<Map<String, Object>> tracks = trackingMapper.listIdsByEventIds(ids);
                    List<String> trackingIds = new ArrayList<>();
                    for (Map<String, Object> track : tracks) {
                        trackingIds.add(WechatExtractService.str(track.get("id")));
                    }
                    if (!trackingIds.isEmpty()) {
                        trackingMapper.deleteDailyByTrackingIds(trackingIds);
                    }
                    trackingMapper.deleteByEventIds(ids);
                    eventMapper.deleteByIds(ids);
                }
                int before = monitorState.events.size();
                List<Map<String, Object>> kept = new ArrayList<>();
                for (Map<String, Object> event : monitorState.events) {
                    if (!category.equals(WechatExtractService.str(event.get("category")))) {
                        kept.add(event);
                    }
                }
                monitorState.events.clear();
                monitorState.events.addAll(kept);
                int deleted = before - monitorState.events.size();

                Map<String, Object> out = new LinkedHashMap<>();
                out.put("ok", true);
                out.put("deleted", deleted);
                out.put("category", category);
                return out;
            }
            return extractService.clearWechatEvents(null);
        } catch (Exception error) {
            throw new ApiException(500, message(error), null);
        }
    }

    // ==================== PUT /api/wechat/events/:id/category ====================

    @PutMapping("/events/{id}/category")
    @Transactional
    public Map<String, Object> updateCategory(@PathVariable("id") String id,
                                              @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> payload = body == null ? new LinkedHashMap<>() : body;
        String category = WechatExtractService.str(payload.getOrDefault("category", ""));
        String oldCategory = WechatExtractService.str(payload.getOrDefault("oldCategory", ""));
        Object triggerLearnRaw = payload.get("triggerLearn");
        boolean triggerLearn = triggerLearnRaw == null || truthy(triggerLearnRaw);

        if (!VALID_CATEGORIES.contains(category)) {
            throw ApiException.badRequest("category 无效，可选：stock_pick / market_news / marketing");
        }
        Map<String, Object> before = eventMapper.findById(id);
        if (before == null) {
            throw new ApiException(404, "消息不存在", null);
        }
        String previousCategory = !oldCategory.isEmpty() ? oldCategory
                : WechatExtractService.str(before.get("category"));
        String messageText = WechatExtractService.str(before.get("message_text"));
        long now = System.currentTimeMillis();

        try {
            eventMapper.updateCategoryManual(id, category);
            extractService.updateWechatEventCategoryInMemory(id, category, null);

            boolean wasStockPick = "stock_pick".equals(previousCategory);
            try {
                List<Map<String, Object>> stocks = extractService.parseJsonList(
                        WechatExtractService.str(before.get("stocks_json")));
                List<Map<String, Object>> validStocks = new ArrayList<>();
                for (Map<String, Object> stock : stocks) {
                    if (stock != null && stock.get("code") != null
                            && SIX_DIGITS.matcher(WechatExtractService.str(stock.get("code")).trim()).matches()) {
                        validStocks.add(stock);
                    }
                }
                boolean nowStockPick = "stock_pick".equals(category);
                if (!wasStockPick && nowStockPick && !validStocks.isEmpty()) {
                    String pickDate = jsDateLiteral(before.get("captured_at"));
                    if (pickDate.isEmpty()) {
                        pickDate = jsDateLiteral(before.get("message_time"));
                    }
                    for (Map<String, Object> stock : validStocks) {
                        Map<String, Object> data = new LinkedHashMap<>();
                        data.put("id", id + "_" + WechatExtractService.str(stock.get("code")));
                        data.put("eventId", id);
                        data.put("chatName", before.get("chat_name") == null ? "" : before.get("chat_name"));
                        data.put("sender", firstNonBlank(before.get("sender"), "未识别发送人"));
                        data.put("stockCode", stock.get("code"));
                        data.put("stockName", stock.get("name") == null ? "" : stock.get("name"));
                        data.put("pickDate", pickDate);
                        data.put("pickMessage", messageText);
                        data.put("createdAt", now);
                        data.put("updatedAt", now);
                        trackingMapper.insertIgnoreTouch(data);
                    }
                } else if (wasStockPick && !nowStockPick) {
                    List<Map<String, Object>> tracks = trackingMapper.listIdsByEventId(id);
                    for (Map<String, Object> track : tracks) {
                        trackingMapper.deleteDailyByTrackingId(WechatExtractService.str(track.get("id")));
                    }
                    trackingMapper.deleteByEventId(id);
                }
            } catch (Exception syncError) {
                // 更新分类后同步追踪表失败
            }

            if (triggerLearn && !previousCategory.isEmpty() && !previousCategory.equals(category)
                    && !messageText.isEmpty()) {
                Map<String, Object> result = categoryService.updateRulesFromFeedback(
                        messageText, previousCategory, 0, category);
                try {
                    Object learned = result == null ? null : result.get("learned");
                    Map<String, Object> feedback = new LinkedHashMap<>();
                    feedback.put("eventId", id);
                    feedback.put("messageText", messageText);
                    feedback.put("predictedCategory", previousCategory);
                    feedback.put("userCorrect", 0);
                    feedback.put("userCorrectedCategory", category);
                    feedback.put("learnedKeywords", extractService.toJson(learned == null ? new ArrayList<>() : learned));
                    feedback.put("createdAt", now);
                    extractService.feedbackMapper().insertFeedback(feedback);
                } catch (Exception feedbackError) {
                    // 写入分类反馈表失败
                }
            }

            boolean learned = triggerLearn && !previousCategory.equals(category);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("ok", true);
            out.put("category", category);
            out.put("learned", learned);

            if (!wasStockPick && "stock_pick".equals(category)) {
                trackingService.autoRefreshTrackingPrices(id);
            }
            return out;
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw new ApiException(500, message(error), null);
        }
    }

    // ==================== PUT /api/wechat/events/:id/text ====================

    @PutMapping("/events/{id}/text")
    @Transactional
    public Map<String, Object> updateText(@PathVariable("id") String id,
                                         @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> payload = body == null ? new LinkedHashMap<>() : body;
        Object messageTextRaw = payload.get("messageText");
        if (!truthy(messageTextRaw)) {
            throw ApiException.badRequest("消息文本不能为空");
        }
        String messageText = WechatExtractService.str(messageTextRaw);

        Map<String, Object> ev = eventMapper.findById(id);
        if (ev == null) {
            throw new ApiException(404, "消息不存在", null);
        }

        try {
            List<Map<String, Object>> oldStocks = extractService.parseJsonList(
                    WechatExtractService.str(ev.get("stocks_json")));
            Map<String, String> oldLogicMap = new LinkedHashMap<>();
            for (Map<String, Object> stock : oldStocks) {
                if (stock != null && stock.get("code") != null && truthy(stock.get("logic"))) {
                    oldLogicMap.put(WechatExtractService.str(stock.get("code")), WechatExtractService.str(stock.get("logic")));
                }
            }

            Map<String, Object> extractResult = extractService.extractWechatStocks(
                    messageText, WechatExtractService.str(ev.get("sender")));
            List<Map<String, Object>> stocks = new ArrayList<>(extractService.parseJsonList(
                    extractService.toJson(extractResult.get("stocks") == null ? new ArrayList<>() : extractResult.get("stocks"))));
            for (Map<String, Object> stock : stocks) {
                String code = WechatExtractService.str(stock.get("code"));
                if (!truthy(stock.get("logic")) && oldLogicMap.containsKey(code)) {
                    stock.put("logic", oldLogicMap.get(code));
                }
            }
            String detectedSender = extractService.cleanSender(WechatExtractService.str(extractResult.get("sender")));
            String finalSender = (!detectedSender.isEmpty() && !"未识别发送人".equals(detectedSender))
                    ? detectedSender : WechatExtractService.str(ev.get("sender"));

            String stocksJson = extractService.toJson(stocks);
            boolean isManual = truthy(ev.get("is_manual"));
            String category = isManual ? WechatExtractService.str(ev.get("category"))
                    : categoryService.categorizeMessage(messageText, stocksJson);
            long now = System.currentTimeMillis();

            Map<String, Object> update = new LinkedHashMap<>();
            update.put("id", id);
            update.put("messageText", messageText);
            update.put("stocksJson", stocksJson);
            update.put("category", category);
            update.put("sender", finalSender);
            update.put("updatedAt", now);
            eventMapper.updateTextAndStocks(update);

            if (!stocks.isEmpty()) {
                String chatName = ev.get("chat_name") == null ? "" : WechatExtractService.str(ev.get("chat_name"));
                String pickDate = jsDateLiteral(ev.get("captured_at"));
                if (pickDate.isEmpty()) {
                    pickDate = jsDateLiteral(ev.get("message_time"));
                }
                if (pickDate.isEmpty()) {
                    Object createdAt = ev.get("created_at");
                    Long epoch = toLong(createdAt);
                    if (epoch != null) {
                        pickDate = Instant.ofEpochMilli(epoch)
                                .atZone(ZoneOffset.UTC).toLocalDate().toString();
                    }
                }
                trackingMapper.deleteByEventId(id);
                for (Map<String, Object> stock : stocks) {
                    Map<String, Object> data = new LinkedHashMap<>();
                    data.put("id", id + "_" + WechatExtractService.str(stock.get("code")));
                    data.put("eventId", id);
                    data.put("chatName", chatName);
                    data.put("sender", finalSender);
                    data.put("stockCode", stock.get("code"));
                    data.put("stockName", stock.get("name") == null ? "" : stock.get("name"));
                    data.put("pickDate", pickDate);
                    data.put("pickMessage", messageText);
                    data.put("createdAt", now);
                    data.put("updatedAt", now);
                    trackingMapper.insertOrUpdateForText(data);
                }
            } else {
                trackingMapper.deleteByEventId(id);
            }

            Map<String, Object> memoryEvent = monitorState.findEvent(id);
            if (memoryEvent != null) {
                memoryEvent.put("usefulMessage", messageText);
                memoryEvent.put("messageText", messageText);
                memoryEvent.put("stocks", stocks);
                memoryEvent.put("category", category);
                memoryEvent.put("sender", finalSender);
                memoryEvent.put("lastUpdated", System.currentTimeMillis());
            }

            if (!category.equals(WechatExtractService.str(ev.get("category")))) {
                categoryService.updateRulesFromFeedback(messageText,
                        WechatExtractService.str(ev.get("category")), 0, category);
            } else if (isManual && !messageText.equals(WechatExtractService.str(ev.get("message_text")))) {
                categoryService.updateRulesFromFeedback(messageText,
                        "stock_pick".equals(category) ? "market_news" : "stock_pick", 0, category);
            }

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("ok", true);
            out.put("stocks", stocks);
            out.put("category", category);
            out.put("sender", finalSender);

            boolean needFill = "stock_pick".equals(category);
            if (needFill) {
                boolean hasEmpty = false;
                for (Map<String, Object> stock : stocks) {
                    if (stock != null && stock.get("code") != null && !truthy(stock.get("logic"))) {
                        hasEmpty = true;
                        break;
                    }
                }
                if (hasEmpty) {
                    trackingService.autoFillStockLogic(id, messageText, stocks);
                }
            }
            return out;
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw new ApiException(500, message(error), null);
        }
    }

    // ==================== PUT /api/wechat/events/:id/stock-logic ====================

    @PutMapping("/events/{id}/stock-logic")
    public Map<String, Object> updateStockLogic(@PathVariable("id") String id,
                                                @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> payload = body == null ? new LinkedHashMap<>() : body;
        Object stockCodeRaw = payload.get("stockCode");
        if (!truthy(stockCodeRaw)) {
            throw ApiException.badRequest("stockCode 不能为空");
        }
        Map<String, Object> event = eventMapper.findById(id);
        if (event == null) {
            throw new ApiException(404, "消息不存在", null);
        }
        try {
            List<Map<String, Object>> stocks = extractService.parseJsonList(
                    WechatExtractService.str(event.get("stocks_json")));
            Map<String, Object> stock = null;
            for (Map<String, Object> candidate : stocks) {
                if (candidate != null && WechatExtractService.str(candidate.get("code"))
                        .equals(WechatExtractService.str(stockCodeRaw))) {
                    stock = candidate;
                    break;
                }
            }
            if (stock == null) {
                throw new ApiException(404, "股票不存在于该消息中", null);
            }
            stock.put("logic", payload.get("logic") == null ? "" : WechatExtractService.str(payload.get("logic")));
            eventMapper.updateStocksJson(id, extractService.toJson(stocks));

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("ok", true);
            out.put("stocks", stocks);
            return out;
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw new ApiException(500, message(error), null);
        }
    }

    // ==================== PUT /api/wechat/events/:id/stocks ====================

    @PutMapping("/events/{id}/stocks")
    @Transactional
    public Map<String, Object> bindStocks(@PathVariable("id") String id,
                                          @RequestBody(required = false) Map<String, Object> body) {
        Object inputRaw = body == null ? null : body.get("stocks");
        if (!(inputRaw instanceof List<?> inputStocks) || inputStocks.isEmpty()) {
            throw ApiException.badRequest("股票列表不能为空");
        }
        List<Map<String, Object>> stocks = new ArrayList<>();
        for (Object item : inputStocks) {
            if (!(item instanceof Map<?, ?> raw) || raw.get("code") == null) {
                continue;
            }
            String code = WechatExtractService.str(raw.get("code")).trim();
            if (!SIX_DIGITS.matcher(code).matches()) {
                continue;
            }
            Map<String, Object> stock = new LinkedHashMap<>();
            stock.put("code", code);
            stock.put("name", raw.get("name") == null ? "" : WechatExtractService.str(raw.get("name")).trim());
            stock.put("logic", raw.get("logic") == null ? "" : WechatExtractService.str(raw.get("logic")).trim());
            stocks.add(stock);
        }
        if (stocks.isEmpty()) {
            throw ApiException.badRequest("未识别到有效的6位股票代码");
        }

        Map<String, Object> ev = eventMapper.findById(id);
        if (ev == null) {
            throw new ApiException(404, "消息不存在", null);
        }

        try {
            String stocksJson = extractService.toJson(stocks);
            long now = System.currentTimeMillis();
            String category = "stock_pick".equals(WechatExtractService.str(ev.get("category")))
                    ? WechatExtractService.str(ev.get("category")) : "stock_pick";

            Map<String, Object> update = new LinkedHashMap<>();
            update.put("id", id);
            update.put("stocksJson", stocksJson);
            update.put("category", category);
            update.put("updatedAt", now);
            eventMapper.updateStocksAndCategory(update);

            trackingMapper.deleteByEventId(id);
            String sender = WechatExtractService.str(ev.get("sender"));
            if ("stock_pick".equals(category) && !sender.isEmpty()) {
                String pickDate = WechatExtractService.normalizeDateStr(ev.get("captured_at"));
                if (pickDate.isEmpty()) {
                    pickDate = WechatExtractService.normalizeDateStr(ev.get("created_at"));
                }
                if (pickDate.isEmpty()) {
                    pickDate = WechatExtractService.normalizeDateStr(ev.get("message_time"));
                }
                if (!pickDate.isEmpty()) {
                    for (Map<String, Object> stock : stocks) {
                        Map<String, Object> data = new LinkedHashMap<>();
                        data.put("id", id + "_" + stock.get("code"));
                        data.put("eventId", id);
                        data.put("chatName", ev.get("chat_name") == null ? "" : ev.get("chat_name"));
                        data.put("sender", sender);
                        data.put("stockCode", stock.get("code"));
                        data.put("stockName", stock.get("name"));
                        data.put("pickDate", pickDate);
                        data.put("pickMessage", ev.get("message_text") == null ? "" : ev.get("message_text"));
                        data.put("createdAt", now);
                        data.put("updatedAt", now);
                        trackingMapper.insertIgnore(data);
                    }
                }
            }

            Map<String, Object> memoryEvent = monitorState.findEvent(id);
            if (memoryEvent != null) {
                memoryEvent.put("stocks", stocks);
                memoryEvent.put("category", category);
                memoryEvent.put("lastUpdated", System.currentTimeMillis());
            }

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("ok", true);
            out.put("stocks", stocks);
            out.put("category", category);

            trackingService.autoRefreshTrackingPrices(id);
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

    private static String firstNonBlank(Object... values) {
        for (Object value : values) {
            String text = WechatExtractService.str(value);
            if (!text.isEmpty()) {
                return text;
            }
        }
        return "";
    }

    private static Long toLong(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number) {
            return ((Number) value).longValue();
        }
        String text = String.valueOf(value).trim();
        if (text.isEmpty()) {
            return null;
        }
        try {
            return (long) Double.parseDouble(text);
        } catch (NumberFormatException error) {
            return null;
        }
    }

    /**
     * 等价 JS 直接把 DB 值拼进 SQL 时的字面量：
     * DATETIME 用 "yyyy-MM-dd HH:mm:ss"，DATE/字符串原样透传。
     */
    static String jsDateLiteral(Object value) {
        if (value == null) {
            return "";
        }
        if (value instanceof LocalDateTime dateTime) {
            return MYSQL_DT.format(dateTime);
        }
        if (value instanceof java.sql.Date date) {
            return date.toLocalDate().toString();
        }
        if (value instanceof java.util.Date date) {
            return MYSQL_DT.format(LocalDateTime.ofInstant(date.toInstant(), ZoneOffset.UTC));
        }
        if (value instanceof Number number) {
            return Instant.ofEpochMilli(number.longValue()).atZone(ZoneOffset.UTC).toLocalDate().toString();
        }
        String text = String.valueOf(value);
        if (MODULE_DATE.matcher(text).matches()) {
            return text;
        }
        return text.isEmpty() ? "" : text;
    }

    static LocalDate parseDateOrNull(String value) {
        try {
            return LocalDate.parse(value);
        } catch (Exception error) {
            return null;
        }
    }
}
