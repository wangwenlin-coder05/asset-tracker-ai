package com.wangwenlin.stock.service;

import com.wangwenlin.stock.mapper.AiLogMapper;
import com.wangwenlin.stock.mapper.WechatEventMapper;
import com.wangwenlin.stock.mapper.WechatTrackingMapper;
import com.wangwenlin.stock.tenant.UserContext;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadFactory;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 微信推票追踪 + 股价刷新 + 投资人分析。
 * 逐行对齐 server.js：syncTrackingFromEvent(11515)、autoRefreshTrackingPrices(11546)、
 * syncExistingTracking(11566)、refreshTrackingPrices(11585)、computeHoldingDays(11292)、
 * isTradingTime(12480)、batchFetchRealtimePrices(12492)、
 * GET /api/wechat/tracking(11812)、GET /api/wechat/tracking/:id/daily(12128)、
 * GET /api/wechat/investor-analysis(12243)、GET /api/wechat/investor/:sender/hold-days(12954)、
 * POST /api/wechat/tracking/refresh-all(12915)、autoFillStockLogic(10815)、callAIMultiImage(10872)。
 */
@Service
public class WechatTrackingService {

    private static final ZoneId BEIJING = ZoneId.of("Asia/Shanghai");
    private static final DateTimeFormatter YMD = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter ISO_MS =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);
    private static final Pattern QT_LINE = Pattern.compile("v_(\\w+)=\"([^\"]+)\"");
    private static final Pattern JSON_ARRAY = Pattern.compile("\\[[\\s\\S]*?\\]");

    private final MarketDataService marketDataService;
    private final WechatTrackingMapper trackingMapper;
    private final WechatEventMapper eventMapper;
    private final WechatExtractService extractService;
    private final WechatMonitorState monitorState;
    private final AiCallService aiCallService;
    private final AiSettingsService aiSettingsService;
    private final AiLogMapper aiLogMapper;
    private final UploadService uploadService;

    public WechatTrackingService(MarketDataService marketDataService,
                                 WechatTrackingMapper trackingMapper,
                                 WechatEventMapper eventMapper,
                                 WechatExtractService extractService,
                                 WechatMonitorState monitorState,
                                 AiCallService aiCallService,
                                 AiSettingsService aiSettingsService,
                                 AiLogMapper aiLogMapper,
                                 UploadService uploadService) {
        this.marketDataService = marketDataService;
        this.trackingMapper = trackingMapper;
        this.eventMapper = eventMapper;
        this.extractService = extractService;
        this.monitorState = monitorState;
        this.aiCallService = aiCallService;
        this.aiSettingsService = aiSettingsService;
        this.aiLogMapper = aiLogMapper;
        this.uploadService = uploadService;
    }

    // ==================================================================
    // 通用数值 / 时间工具（对齐 JS 的 number 语义）
    // ==================================================================

    static String str(Object value) {
        return WechatExtractService.str(value);
    }

    /** 等价 JS Number(x)：null -> null（调用点按 Node 语义处理），无法解析 -> NaN。 */
    static Double num(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Double) {
            return (Double) value;
        }
        if (value instanceof BigDecimal) {
            return ((BigDecimal) value).doubleValue();
        }
        if (value instanceof Number) {
            return ((Number) value).doubleValue();
        }
        if (value instanceof Boolean) {
            return ((Boolean) value) ? 1.0 : 0.0;
        }
        String text = String.valueOf(value).trim();
        if (text.isEmpty()) {
            return Double.NaN;
        }
        try {
            return Double.parseDouble(text);
        } catch (NumberFormatException error) {
            return Double.NaN;
        }
    }

    /** 等价 JS Number(x) || 0。 */
    static double numOrZero(Object value) {
        Double n = num(value);
        return n == null || n.isNaN() ? 0.0 : n;
    }

    static Long longNum(Object value) {
        Double n = num(value);
        if (n == null || n.isNaN()) {
            return null;
        }
        return (long) Math.rint(n);
    }

    static boolean truthy(Object value) {
        if (value == null) {
            return false;
        }
        if (value instanceof Boolean) {
            return (Boolean) value;
        }
        if (value instanceof Number) {
            double n = ((Number) value).doubleValue();
            return n != 0 && !Double.isNaN(n);
        }
        String text = String.valueOf(value);
        return !text.isEmpty() && !"0".equals(text) && !"false".equals(text) && !"null".equals(text);
    }

    /** JS 数字真值判断：null / NaN / 0 均为 falsy。 */
    static boolean numTruthy(Double value) {
        return value != null && !value.isNaN() && value != 0.0;
    }

    static Double round1(double value) {
        return Math.round(value * 10) / 10.0;
    }

    static Double round2(double value) {
        return Math.round(value * 100) / 100.0;
    }

    static Double round3(double value) {
        return Math.round(value * 1000) / 1000.0;
    }

    static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isEmpty()) {
                return value;
            }
        }
        return "";
    }

    private static Long dateDiffDays(String from, String to) {
        if (from == null || from.isEmpty() || to == null || to.isEmpty()) {
            return null;
        }
        try {
            long days = ChronoUnit.DAYS.between(LocalDate.parse(from), LocalDate.parse(to));
            return days >= 0 ? days : null;
        } catch (Exception error) {
            return null;
        }
    }

    /** 等价 computeHoldingDays(r, today)。 */
    public Long computeHoldingDays(Map<String, Object> row, String today) {
        if (truthy(row.get("is_effective_profit")) && row.get("effective_profit_day_index") != null) {
            return longNum(row.get("effective_profit_day_index"));
        }
        String pickDate = str(row.get("pick_date"));
        String latestDate = str(row.get("latest_date"));
        String refDate = (!latestDate.isEmpty() && latestDate.compareTo(pickDate) > 0) ? latestDate : today;
        Long days = dateDiffDays(pickDate, refDate);
        int entryType = (int) Math.rint(numOrZero(row.get("entry_type")));
        if (entryType == 1) {
            // 等价 JS 的 Math.max(0, null - 1) === 0
            return days == null ? Long.valueOf(0L) : Long.valueOf(Math.max(0L, days - 1));
        }
        return days;
    }

    /** 等价 isTradingTime()：周一至周五 9:15-11:30 / 13:00-15:00。 */
    public boolean isTradingTime() {
        ZonedDateTime now = ZonedDateTime.now(BEIJING);
        DayOfWeek day = now.getDayOfWeek();
        if (day == DayOfWeek.SATURDAY || day == DayOfWeek.SUNDAY) {
            return false;
        }
        int minutes = now.getHour() * 60 + now.getMinute();
        return (minutes >= 9 * 60 + 15 && minutes <= 11 * 60 + 30)
                || (minutes >= 13 * 60 && minutes <= 15 * 60);
    }

    private static Double parseQtField(String text) {
        if (text == null || text.isEmpty()) {
            return null;
        }
        try {
            return Double.parseDouble(text);
        } catch (NumberFormatException error) {
            return Double.NaN;
        }
    }

    // ==================================================================
    // 实时行情
    // ==================================================================

    /** 等价 batchFetchRealtimePrices(codes)：腾讯批量实时价，code -> 现价。 */
    public Map<String, Double> batchFetchRealtimePrices(List<String> codes) {
        Map<String, Double> map = new LinkedHashMap<>();
        if (codes == null || codes.isEmpty()) {
            return map;
        }
        List<String> unique = new ArrayList<>(new LinkedHashSet<>(codes));
        int batchSize = 60;
        for (int i = 0; i < unique.size(); i += batchSize) {
            List<String> batch = unique.subList(i, Math.min(i + batchSize, unique.size()));
            StringBuilder query = new StringBuilder();
            for (int k = 0; k < batch.size(); k++) {
                if (k > 0) {
                    query.append(',');
                }
                query.append(marketDataService.stockCodeToTencent(batch.get(k)));
            }
            try {
                byte[] bytes = marketDataService.httpGetBytes(
                        "https://qt.gtimg.cn/q=" + query, Duration.ofSeconds(5));
                String text = marketDataService.decodeGbk(bytes);
                for (String line : text.split("\n", -1)) {
                    Matcher matcher = QT_LINE.matcher(line);
                    if (!matcher.find()) {
                        continue;
                    }
                    String qtCode = matcher.group(1);
                    String[] fields = matcher.group(2).split("~", -1);
                    Double price = fields.length > 3 ? parseQtField(fields[3]) : null;
                    Double prevClose = fields.length > 4 ? parseQtField(fields[4]) : null;
                    if (qtCode.isEmpty() || price == null || prevClose == null
                            || price <= 0 || prevClose <= 0) {
                        continue;
                    }
                    map.put(qtCode.replaceFirst("^(sh|sz|bj)", ""), price);
                }
            } catch (Exception ignored) {
                // 单批失败就跳过
            }
        }
        return map;
    }

    /** 腾讯单只实时价（refreshTrackingPrices / daily 用）。 */
    private Double fetchSingleRealtimePrice(String stockCode) {
        try {
            String qtCode = marketDataService.stockCodeToTencent(stockCode);
            byte[] bytes = marketDataService.httpGetBytes(
                    "https://qt.gtimg.cn/q=" + qtCode, Duration.ofMillis(5000));
            String text = marketDataService.decodeGbk(bytes);
            Matcher matcher = QT_LINE.matcher(text);
            if (matcher.find()) {
                String[] fields = matcher.group(2).split("~", -1);
                if (fields.length > 3) {
                    Double price = parseQtField(fields[3]);
                    if (price != null && price > 0) {
                        return price;
                    }
                }
            }
        } catch (Exception ignored) {
            // 实时价失败就用日K数据
        }
        return null;
    }

    // ==================================================================
    // 追踪同步 / 刷新
    // ==================================================================

    /** 等价 syncTrackingFromEvent(eventRow)。 */
    public void syncTrackingFromEvent(Map<String, Object> eventRow) {
        if (eventRow == null || eventRow.get("id") == null) {
            return;
        }
        if (!"stock_pick".equals(str(eventRow.get("category")))) {
            return;
        }
        List<Map<String, Object>> stocks = extractService.parseJsonList(str(eventRow.get("stocks_json")));
        if (stocks.isEmpty()) {
            return;
        }
        String sender = str(eventRow.get("sender"));
        if (sender.isEmpty() || "未识别发送人".equals(sender)) {
            return;
        }
        String pickDate = firstNonBlank(
                WechatExtractService.normalizeDateStr(eventRow.get("captured_at")),
                WechatExtractService.normalizeDateStr(eventRow.get("created_at")),
                WechatExtractService.normalizeDateStr(eventRow.get("message_time")));
        if (pickDate.isEmpty()) {
            return;
        }
        long now = System.currentTimeMillis();
        String eventId = str(eventRow.get("id"));
        for (Map<String, Object> stock : stocks) {
            if (stock == null || stock.get("code") == null || str(stock.get("code")).isEmpty()) {
                continue;
            }
            String code = str(stock.get("code"));
            Map<String, Object> tracking = new LinkedHashMap<>();
            tracking.put("id", eventId + "_" + code);
            tracking.put("eventId", eventId);
            tracking.put("chatName", str(eventRow.get("chat_name")));
            tracking.put("sender", sender);
            tracking.put("stockCode", code);
            tracking.put("stockName", str(stock.get("name")));
            tracking.put("pickDate", pickDate);
            tracking.put("pickMessage", str(eventRow.get("message_text")));
            tracking.put("createdAt", now);
            tracking.put("updatedAt", now);
            try {
                trackingMapper.insertIgnore(tracking);
            } catch (Exception error) {
                // sync tracking insert failed
            }
        }
    }

    /** 等价 autoRefreshTrackingPrices(eventId)：异步执行，不阻塞响应。 */
    public void autoRefreshTrackingPrices(String eventId) {
        UserContext.CurrentUser user = UserContext.current();
        Thread thread = new Thread(() -> {
            UserContext.set(user);
            try {
                List<Map<String, Object>> trackings = trackingMapper.listIdsByEventId(eventId);
                for (Map<String, Object> tracking : trackings) {
                    try {
                        refreshTrackingPrices(str(tracking.get("id")));
                    } catch (Exception ignored) {
                        // 单条刷新失败不影响其他
                    }
                }
            } catch (Exception ignored) {
                // autoRefreshTrackingPrices failed
            } finally {
                UserContext.clear();
            }
        }, "wechat-auto-refresh");
        thread.setDaemon(true);
        thread.start();
    }

    /** 等价 syncExistingTracking()。 */
    public void syncExistingTracking() {
        try {
            for (Map<String, Object> event : eventMapper.listAllPicks()) {
                syncTrackingFromEvent(event);
            }
        } catch (Exception ignored) {
            // 启动同步追踪失败
        }
    }

    /** 等价 refreshTrackingPrices(trackingId)。 */
    public Map<String, Object> refreshTrackingPrices(String trackingId) throws Exception {
        Map<String, Object> row = trackingMapper.findById(trackingId);
        if (row == null) {
            throw new IllegalStateException("追踪记录不存在");
        }
        boolean isLocked = truthy(row.get("locked"));
        String stockCode = str(row.get("stock_code"));
        List<Map<String, Object>> history = marketDataService.stockDailyHistory(stockCode, 120.0);
        if (history.isEmpty()) {
            throw new IllegalStateException("无法获取 " + stockCode + " 的历史K线");
        }
        String targetDate = WechatExtractService.normalizeDateStr(row.get("pick_date"));
        int startIndex = -1;
        for (int i = 0; i < history.size(); i++) {
            if (targetDate.equals(str(history.get(i).get("date")))) {
                startIndex = i;
                break;
            }
        }
        if (startIndex == -1) {
            for (int i = 0; i < history.size(); i++) {
                if (str(history.get(i).get("date")).compareTo(targetDate) > 0) {
                    startIndex = i;
                    break;
                }
            }
            if (startIndex == -1) {
                throw new IllegalStateException(stockCode + " 推票日 " + targetDate + " 之后无交易日数据");
            }
        }

        int entryType = (int) Math.rint(numOrZero(row.get("entry_type")));
        Map<String, Object> pickK = history.get(startIndex);
        Double pickOpenObj = num(pickK.get("open"));
        Double pickCloseObj = num(pickK.get("close"));
        double pickOpen = pickOpenObj == null || pickOpenObj.isNaN() ? 0.0 : pickOpenObj;
        double pickClose = pickCloseObj == null || pickCloseObj.isNaN() ? 0.0 : pickCloseObj;
        double entryPrice = entryType == 1 ? pickClose : pickOpen;
        Double pickChangePercent = pickOpen > 0
                ? round2(((pickClose - pickOpen) / pickOpen) * 100.0)
                : null;

        Double d1OpenChangePercent = null;
        boolean hasD1 = startIndex + 1 < history.size();
        if (hasD1 && entryPrice > 0) {
            double d1Open = numOrZero(history.get(startIndex + 1).get("open"));
            d1OpenChangePercent = round2(((d1Open - entryPrice) / entryPrice) * 100.0);
        }

        long now = System.currentTimeMillis();
        double latestClose = pickClose;
        String latestDate = str(pickK.get("date"));
        for (int i = startIndex; i < history.size(); i++) {
            Map<String, Object> bar = history.get(i);
            int dayIndex = i - startIndex;
            double dayChangeBase = dayIndex == 0
                    ? numOrZero(bar.get("open"))
                    : (i > 0 ? numOrZero(history.get(i - 1).get("close")) : numOrZero(bar.get("open")));
            Double dayChangePercent = dayChangeBase > 0
                    ? round2(((numOrZero(bar.get("close")) - dayChangeBase) / dayChangeBase) * 100.0)
                    : null;
            Double totalChangePercent = entryPrice > 0
                    ? round2(((numOrZero(bar.get("close")) - entryPrice) / entryPrice) * 100.0)
                    : null;
            Double totalChangeAmount = entryPrice > 0
                    ? round3(numOrZero(bar.get("close")) - entryPrice)
                    : null;
            Map<String, Object> daily = new LinkedHashMap<>();
            daily.put("id", trackingId + "_" + str(bar.get("date")));
            daily.put("trackingId", trackingId);
            daily.put("tradeDate", bar.get("date"));
            daily.put("dayIndex", dayIndex);
            daily.put("openPrice", bar.get("open"));
            daily.put("closePrice", bar.get("close"));
            daily.put("highPrice", bar.get("high"));
            daily.put("lowPrice", bar.get("low"));
            daily.put("dayChangePercent", dayChangePercent);
            daily.put("totalChangePercent", totalChangePercent);
            daily.put("totalChangeAmount", totalChangeAmount);
            daily.put("updatedAt", now);
            trackingMapper.upsertDaily(daily);
            latestClose = numOrZero(bar.get("close"));
            latestDate = str(bar.get("date"));
        }

        Double totalChangePercent = entryPrice > 0
                ? round2(((latestClose - entryPrice) / entryPrice) * 100.0)
                : null;
        Double totalChangeAmount = entryPrice > 0 ? round3(latestClose - entryPrice) : null;

        int isEffectiveProfit = 0;
        Long effectiveProfitDayIndex = null;
        Double effectiveProfitPercent = null;

        if (!isLocked) {
            double targetProfit = numOrZero(row.get("target_profit_percent"));
            if (targetProfit == 0.0) {
                targetProfit = 5.00;
            }
            int startSearchDay = 1;
            if (entryType == 0) {
                Double d0TotalPercent = pickOpen > 0
                        ? round2(((pickClose - pickOpen) / pickOpen) * 100.0)
                        : null;
                if (d0TotalPercent != null && d0TotalPercent > targetProfit) {
                    if (hasD1 && d1OpenChangePercent != null && d1OpenChangePercent >= targetProfit) {
                        isEffectiveProfit = 1;
                        effectiveProfitDayIndex = 1L;
                        effectiveProfitPercent = d1OpenChangePercent;
                        startSearchDay = 2;
                    }
                }
            }
            if (isEffectiveProfit == 0) {
                for (Map<String, Object> dailyRow : trackingMapper.listDailyFromDay(trackingId, startSearchDay)) {
                    double closePct = numOrZero(dailyRow.get("total_change_percent"));
                    double highPrice = numOrZero(dailyRow.get("high_price"));
                    Double highPct = null;
                    if (highPrice > 0 && entryPrice > 0) {
                        highPct = round2(((highPrice - entryPrice) / entryPrice) * 100.0);
                    }
                    Double bestPct = highPct != null ? Math.max(highPct, closePct) : closePct;
                    if (bestPct >= targetProfit) {
                        isEffectiveProfit = 1;
                        effectiveProfitDayIndex = longNum(dailyRow.get("day_index"));
                        effectiveProfitPercent = round2(bestPct);
                        break;
                    }
                }
            }
        }

        if (!isLocked) {
            Map<String, Object> update = new LinkedHashMap<>();
            update.put("id", trackingId);
            update.put("pickOpenPrice", pickOpenObj);
            update.put("pickClosePrice", pickCloseObj);
            update.put("pickChangePercent", pickChangePercent);
            update.put("latestDate", latestDate);
            update.put("latestClosePrice", latestClose);
            update.put("totalChangePercent", totalChangePercent);
            update.put("totalChangeAmount", totalChangeAmount);
            update.put("d1OpenChangePercent", d1OpenChangePercent);
            update.put("isEffectiveProfit", isEffectiveProfit);
            update.put("effectiveProfitDayIndex", effectiveProfitDayIndex);
            update.put("effectiveProfitPercent", effectiveProfitPercent);
            update.put("updatedAt", now);
            trackingMapper.updateQuoteFields(update);
        }

        if (!isLocked && isTradingTime()) {
            Double price = fetchSingleRealtimePrice(stockCode);
            if (price != null && price > 0) {
                Double rtTotalChangePercent = pickOpen > 0
                        ? round2(((price - pickOpen) / pickOpen) * 100.0)
                        : null;
                Double rtTotalChangeAmount = pickOpen > 0 ? round3(price - pickOpen) : null;
                Map<String, Object> realtime = new LinkedHashMap<>();
                realtime.put("id", trackingId);
                realtime.put("price", price);
                realtime.put("totalChangePercent", rtTotalChangePercent);
                realtime.put("totalChangeAmount", rtTotalChangeAmount);
                realtime.put("updatedAt", System.currentTimeMillis());
                trackingMapper.updateRealtimeQuote(realtime);
                latestClose = price;
                totalChangePercent = rtTotalChangePercent;
                totalChangeAmount = rtTotalChangeAmount;
            }
        }

        String today = marketDataService.todayStr();
        MarketDataService.TradingStatus status = marketDataService.todayTradingStatus();
        boolean isPan = !status.closeFinal();
        boolean pickCloseIsRealTime = str(pickK.get("date")).equals(today) && isPan;
        boolean latestCloseIsRealTime = latestDate.equals(today) && isPan;

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", row.get("id"));
        out.put("stockCode", row.get("stock_code"));
        out.put("stockName", row.get("stock_name"));
        out.put("pickDate", row.get("pick_date"));
        out.put("pickOpenPrice", pickOpenObj);
        out.put("pickClosePrice", pickCloseObj);
        out.put("pickCloseIsRealTime", pickCloseIsRealTime);
        out.put("pickChangePercent", pickChangePercent);
        out.put("d1OpenChangePercent", d1OpenChangePercent);
        out.put("latestDate", latestDate);
        out.put("latestClosePrice", latestClose);
        out.put("latestCloseIsRealTime", latestCloseIsRealTime);
        out.put("totalChangePercent", totalChangePercent);
        out.put("totalChangeAmount", totalChangeAmount);
        out.put("isEffectiveProfit", isEffectiveProfit);
        out.put("effectiveProfitDayIndex", effectiveProfitDayIndex);
        out.put("effectiveProfitPercent", effectiveProfitPercent);
        out.put("locked", isLocked);
        out.put("refreshedAt", ISO_MS.format(Instant.now()));
        return out;
    }

    /** 等价 POST /api/wechat/tracking/refresh-all：并发 5 批量刷新未锁定记录。 */
    public Map<String, Object> refreshAll() {
        List<Map<String, Object>> rows = trackingMapper.listUnlocked();
        int success = 0;
        List<Map<String, Object>> errors = new ArrayList<>();
        if (!rows.isEmpty()) {
            UserContext.CurrentUser user = UserContext.current();
            ThreadFactory factory = runnable -> {
                Thread thread = new Thread(runnable, "wechat-refresh-all");
                thread.setDaemon(true);
                return thread;
            };
            ExecutorService pool = Executors.newFixedThreadPool(5, factory);
            try {
                int concurrency = 5;
                for (int i = 0; i < rows.size(); i += concurrency) {
                    int end = Math.min(i + concurrency, rows.size());
                    List<Map<String, Object>> batch = rows.subList(i, end);
                    List<Callable<Map<String, Object>>> tasks = new ArrayList<>();
                    for (Map<String, Object> row : batch) {
                        String id = str(row.get("id"));
                        String code = str(row.get("stock_code"));
                        String name = str(row.get("stock_name"));
                        tasks.add(() -> {
                            UserContext.set(user);
                            try {
                                refreshTrackingPrices(id);
                                return null;
                            } catch (Exception error) {
                                Map<String, Object> failure = new LinkedHashMap<>();
                                failure.put("id", id);
                                failure.put("code", code);
                                failure.put("name", name);
                                failure.put("error", error.getMessage() == null ? "失败" : error.getMessage());
                                return failure;
                            } finally {
                                UserContext.clear();
                            }
                        });
                    }
                    try {
                        for (Future<Map<String, Object>> future : pool.invokeAll(tasks)) {
                            Map<String, Object> failure = future.get();
                            if (failure == null) {
                                success++;
                            } else {
                                errors.add(failure);
                            }
                        }
                    } catch (Exception ignored) {
                        // 批次异常
                    }
                }
            } finally {
                pool.shutdownNow();
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", rows.size());
        out.put("success", success);
        out.put("failed", errors.size());
        out.put("errors", errors);
        return out;
    }

    // ==================================================================
    // GET /api/wechat/tracking
    // ==================================================================

    public Map<String, Object> getTrackingList(String sender, Integer limitRaw) {
        int limit = Math.min(limitRaw == null ? 100 : limitRaw, 500);
        try {
            for (Map<String, Object> event : eventMapper.listRecentPicks()) {
                syncTrackingFromEvent(event);
            }
        } catch (Exception ignored) {
            // auto sync tracking failed
        }

        List<Map<String, Object>> rows = trackingMapper.listDistinctPicks(
                sender == null || sender.isEmpty() ? null : sender, limit);
        MarketDataService.TradingStatus status = marketDataService.todayTradingStatus();
        String today = marketDataService.todayStr();
        boolean isPan = !status.closeFinal();

        Map<String, Double> realtimePrices = new LinkedHashMap<>();
        if (isTradingTime() && !rows.isEmpty()) {
            List<String> codes = new ArrayList<>();
            for (Map<String, Object> row : rows) {
                String code = str(row.get("stock_code"));
                if (!code.isEmpty()) {
                    codes.add(code);
                }
            }
            realtimePrices = batchFetchRealtimePrices(codes);
        }

        List<Map<String, Object>> data = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            data.add(mapTrackingRow(row, today, isPan, realtimePrices));
        }

        int upCount = 0;
        int downCount = 0;
        int flatCount = 0;
        int pendingCount = 0;
        int lockedCount = 0;
        for (Map<String, Object> item : data) {
            if (Boolean.TRUE.equals(item.get("locked"))) {
                lockedCount++;
                continue;
            }
            Double totalChangePercent = (Double) item.get("totalChangePercent");
            if (totalChangePercent == null) {
                pendingCount++;
            } else if (totalChangePercent > 0.01) {
                upCount++;
            } else if (totalChangePercent < -0.01) {
                downCount++;
            } else {
                flatCount++;
            }
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("total", data.size());
        summary.put("lockedCount", lockedCount);
        summary.put("upCount", upCount);
        summary.put("downCount", downCount);
        summary.put("flatCount", flatCount);
        summary.put("pendingCount", pendingCount);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("data", data);
        out.put("summary", summary);
        return out;
    }

    private Map<String, Object> mapTrackingRow(Map<String, Object> row, String today, boolean isPan,
                                               Map<String, Double> realtimePrices) {
        boolean locked = truthy(row.get("locked"));
        boolean pickIsToday = str(row.get("pick_date")).equals(today);
        boolean latestIsToday = str(row.get("latest_date")).equals(today);
        boolean pickCloseIsRealTime = pickIsToday && isPan;
        boolean latestCloseIsRealTime = latestIsToday && isPan;

        Double latestClosePrice = row.get("latest_close_price") != null ? num(row.get("latest_close_price")) : null;
        Double totalChangePercent = row.get("total_change_percent") != null ? num(row.get("total_change_percent")) : null;
        Double totalChangeAmount = row.get("total_change_amount") != null ? num(row.get("total_change_amount")) : null;

        Double realtimePrice = realtimePrices.get(str(row.get("stock_code")));
        int entryType = (int) Math.rint(numOrZero(row.get("entry_type")));
        if (numTruthy(realtimePrice) && !locked) {
            Double pickOpen = num(row.get("pick_open_price"));
            Double pickClose = num(row.get("pick_close_price"));
            Double entryPrice = entryType == 1 ? pickClose : pickOpen;
            if (entryPrice != null && entryPrice > 0) {
                latestClosePrice = realtimePrice;
                totalChangePercent = round2(((realtimePrice - entryPrice) / entryPrice) * 100.0);
                totalChangeAmount = round3(realtimePrice - entryPrice);
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", row.get("id"));
        out.put("eventId", row.get("event_id"));
        out.put("chatName", row.get("chat_name"));
        out.put("sender", row.get("sender"));
        out.put("stockCode", row.get("stock_code"));
        out.put("stockName", row.get("stock_name"));
        out.put("pickDate", row.get("pick_date"));
        out.put("pickOpenPrice", row.get("pick_open_price") != null ? num(row.get("pick_open_price")) : null);
        out.put("pickClosePrice", row.get("pick_close_price") != null ? num(row.get("pick_close_price")) : null);
        out.put("pickCloseIsRealTime", pickCloseIsRealTime);
        out.put("pickChangePercent", row.get("pick_change_percent") != null ? num(row.get("pick_change_percent")) : null);
        out.put("d1OpenChangePercent", row.get("d1_open_change_percent") != null ? num(row.get("d1_open_change_percent")) : null);
        out.put("latestDate", str(row.get("latest_date")));
        out.put("latestClosePrice", latestClosePrice);
        out.put("latestCloseIsRealTime", !locked && (latestCloseIsRealTime || numTruthy(realtimePrice)));
        out.put("totalChangePercent", totalChangePercent);
        out.put("totalChangeAmount", totalChangeAmount);
        out.put("holdingDays", computeHoldingDays(row, today));
        out.put("isEffectiveProfit", truthy(row.get("is_effective_profit")));
        out.put("effectiveProfitDayIndex", row.get("effective_profit_day_index") != null
                ? longNum(row.get("effective_profit_day_index")) : null);
        out.put("effectiveProfitPercent", row.get("effective_profit_percent") != null
                ? num(row.get("effective_profit_percent")) : null);
        out.put("pickMessage", str(row.get("pick_message")));
        out.put("entryType", entryType);
        out.put("locked", locked);
        out.put("createdAt", longNum(row.get("created_at")));
        out.put("updatedAt", longNum(row.get("updated_at")));
        return out;
    }

    // ==================================================================
    // GET /api/wechat/tracking/:id/daily
    // ==================================================================

    public Map<String, Object> getDaily(String trackingId) {
        Map<String, Object> infoRow = trackingMapper.findById(trackingId);
        boolean locked = infoRow != null && truthy(infoRow.get("locked"));
        Long lockDayIdx = infoRow != null && infoRow.get("effective_profit_day_index") != null
                ? longNum(infoRow.get("effective_profit_day_index")) : null;
        Double lockPercent = infoRow != null && infoRow.get("effective_profit_percent") != null
                ? num(infoRow.get("effective_profit_percent")) : null;
        Double pickOpen = infoRow != null && infoRow.get("pick_open_price") != null
                ? num(infoRow.get("pick_open_price")) : null;
        Double lockPrice = (locked && lockDayIdx != null && lockPercent != null && pickOpen != null)
                ? round2(pickOpen * (1 + lockPercent / 100.0))
                : null;

        List<Map<String, Object>> rows;
        if (locked && lockDayIdx != null) {
            rows = trackingMapper.listDailyUpTo(trackingId, lockDayIdx.intValue());
        } else {
            rows = trackingMapper.listDaily(trackingId);
        }

        Double livePrice = null;
        boolean liveIsRealTime = false;
        if (!rows.isEmpty() && isTradingTime() && infoRow != null) {
            Double price = fetchSingleRealtimePrice(str(infoRow.get("stock_code")));
            if (price != null && price > 0) {
                livePrice = price;
                liveIsRealTime = true;
            }
        }

        String today = marketDataService.todayStr();
        List<Map<String, Object>> data = new ArrayList<>();
        for (int idx = 0; idx < rows.size(); idx++) {
            Map<String, Object> row = rows.get(idx);
            boolean isLastRow = idx == rows.size() - 1;
            boolean isToday = today.equals(str(row.get("trade_date")));
            Long dayIndex = longNum(row.get("day_index"));
            boolean isProfitDay = locked && lockDayIdx != null && lockDayIdx.equals(dayIndex);
            boolean showLive = isLastRow && isToday && !isProfitDay && liveIsRealTime && livePrice != null;
            Double close = row.get("close_price") != null ? num(row.get("close_price")) : null;

            Double intradayPrice;
            boolean intradayIsRealTime;
            boolean intradayLocked;
            if (isProfitDay) {
                intradayPrice = lockPrice != null ? lockPrice : close;
                intradayIsRealTime = false;
                intradayLocked = true;
            } else if (showLive) {
                intradayPrice = livePrice;
                intradayIsRealTime = true;
                intradayLocked = false;
            } else {
                intradayPrice = close;
                intradayIsRealTime = false;
                intradayLocked = false;
            }

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", row.get("id"));
            item.put("trackingId", row.get("tracking_id"));
            item.put("tradeDate", row.get("trade_date"));
            item.put("dayIndex", dayIndex);
            item.put("openPrice", row.get("open_price") != null ? num(row.get("open_price")) : null);
            item.put("closePrice", close);
            item.put("intradayPrice", intradayPrice);
            item.put("intradayIsRealTime", intradayIsRealTime);
            item.put("intradayLocked", intradayLocked);
            item.put("isProfitDay", isProfitDay);
            item.put("highPrice", row.get("high_price") != null ? num(row.get("high_price")) : null);
            item.put("lowPrice", row.get("low_price") != null ? num(row.get("low_price")) : null);
            item.put("dayChangePercent", row.get("day_change_percent") != null ? num(row.get("day_change_percent")) : null);
            item.put("totalChangePercent", row.get("total_change_percent") != null ? num(row.get("total_change_percent")) : null);
            item.put("totalChangeAmount", row.get("total_change_amount") != null ? num(row.get("total_change_amount")) : null);
            data.add(item);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("data", data);
        return out;
    }

    // ==================================================================
    // GET /api/wechat/investor-analysis
    // ==================================================================

    public Map<String, Object> investorAnalysis(Integer daysRaw, Double targetRaw) {
        int days = Math.max(1, Math.min(60, daysRaw == null ? 7 : daysRaw));
        double targetProfitPercent = Math.max(0.5, Math.min(50, targetRaw == null ? 5.00 : targetRaw));
        LocalDate todayDate = LocalDate.now(BEIJING);
        String sinceStr = todayDate.minusDays(days).format(YMD);
        int todayDow = (todayDate.getDayOfWeek().getValue() + 6) % 7;
        String sinceWeekStr = todayDate.minusDays(todayDow).format(YMD);
        String querySince = sinceStr.compareTo(sinceWeekStr) < 0 ? sinceStr : sinceWeekStr;
        String todayStr = todayDate.format(YMD);

        List<Map<String, Object>> trackings = trackingMapper.listForInvestorAnalysis(querySince);
        for (Map<String, Object> tracking : trackings) {
            tracking.put("isThisWeek", str(tracking.get("pick_date")).compareTo(sinceWeekStr) >= 0);
        }

        if (isTradingTime() && !trackings.isEmpty()) {
            List<String> codes = new ArrayList<>(new LinkedHashSet<>(collectCodes(trackings)));
            Map<String, Double> realtimeMap = batchFetchRealtimePrices(codes);
            for (Map<String, Object> tracking : trackings) {
                Double realtimePrice = realtimeMap.get(str(tracking.get("stock_code")));
                Object pickOpenRaw = tracking.get("pick_open_price");
                if (numTruthy(realtimePrice) && truthy(pickOpenRaw)) {
                    double pickOpen = numOrZero(pickOpenRaw);
                    if (pickOpen != 0) {
                        tracking.put("total_change_percent", round2(((realtimePrice - pickOpen) / pickOpen) * 100.0));
                    }
                }
            }
        }

        Map<String, Map<String, Object>> effectiveByTracking = new LinkedHashMap<>();
        List<Map<String, Object>> toRecalc = new ArrayList<>();
        for (Map<String, Object> tracking : trackings) {
            if (!truthy(tracking.get("locked"))) {
                toRecalc.add(tracking);
            }
        }
        if (!toRecalc.isEmpty()) {
            List<String> ids = new ArrayList<>();
            for (Map<String, Object> tracking : toRecalc) {
                ids.add(str(tracking.get("id")));
            }
            List<Map<String, Object>> dailyAll = trackingMapper.listDailyByTrackingIds(ids);
            Map<String, List<Map<String, Object>>> dailyMap = new LinkedHashMap<>();
            for (Map<String, Object> daily : dailyAll) {
                dailyMap.computeIfAbsent(str(daily.get("tracking_id")), key -> new ArrayList<>()).add(daily);
            }
            boolean needLivePrice = isTradingTime();
            for (Map<String, Object> tracking : toRecalc) {
                double pickOpen = numOrZero(tracking.get("pick_open_price"));
                double d0Pct = numOrZero(tracking.get("pick_change_percent"));
                int isEff = 0;
                Long dayIdx = null;
                List<Map<String, Object>> dailies = dailyMap.getOrDefault(str(tracking.get("id")), new ArrayList<>());

                int startSearchDay = 1;
                if (d0Pct > targetProfitPercent) {
                    Double d1 = num(tracking.get("d1_open_change_percent"));
                    if (d1 != null && !d1.isNaN() && d1 >= targetProfitPercent) {
                        isEff = 1;
                        dayIdx = 1L;
                        startSearchDay = 2;
                    }
                }
                if (isEff == 0) {
                    Long found = findEffectiveDayIndex(dailies, pickOpen, startSearchDay, targetProfitPercent);
                    if (found != null) {
                        isEff = 1;
                        dayIdx = found;
                    }
                }
                if (isEff == 0 && needLivePrice) {
                    Double liveTotalChange = num(tracking.get("total_change_percent"));
                    if (liveTotalChange != null && !liveTotalChange.isNaN() && liveTotalChange >= targetProfitPercent) {
                        isEff = 1;
                        dayIdx = null;
                    }
                }
                Map<String, Object> state = new LinkedHashMap<>();
                state.put("isEffective", isEff);
                state.put("dayIndex", dayIdx);
                effectiveByTracking.put(str(tracking.get("id")), state);
            }
        }

        List<Map<String, Object>> allTrackings = new ArrayList<>();
        for (Map<String, Object> tracking : trackings) {
            if (str(tracking.get("pick_date")).compareTo(sinceStr) >= 0) {
                allTrackings.add(tracking);
            }
        }
        List<Map<String, Object>> weekTrackings = new ArrayList<>();
        for (Map<String, Object> tracking : trackings) {
            if (Boolean.TRUE.equals(tracking.get("isThisWeek"))) {
                weekTrackings.add(tracking);
            }
        }

        List<Map<String, Object>> allData = buildInvestorStats(allTrackings, todayStr, effectiveByTracking);
        List<Map<String, Object>> weekData = buildInvestorStats(weekTrackings, todayStr, effectiveByTracking);

        Map<String, Map<String, Object>> weekMap = new LinkedHashMap<>();
        for (Map<String, Object> week : weekData) {
            weekMap.put(str(week.get("sender")), week);
        }

        List<Map<String, Object>> data = new ArrayList<>();
        for (Map<String, Object> item : allData) {
            Map<String, Object> merged = new LinkedHashMap<>(item);
            merged.put("week", weekMap.get(str(item.get("sender"))));
            data.add(merged);
        }
        data.sort((a, b) -> {
            double left = numOrZero(a.get("avgChangePercent"));
            double right = numOrZero(b.get("avgChangePercent"));
            return Double.compare(right, left);
        });

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("data", data);
        out.put("days", days);
        out.put("sinceDate", sinceStr);
        out.put("sinceWeekDate", sinceWeekStr);
        out.put("targetProfitPercent", targetProfitPercent);
        return out;
    }

    private static List<String> collectCodes(List<Map<String, Object>> trackings) {
        List<String> codes = new ArrayList<>();
        for (Map<String, Object> tracking : trackings) {
            String code = str(tracking.get("stock_code"));
            if (!code.isEmpty()) {
                codes.add(code);
            }
        }
        return codes;
    }

    private static Long findEffectiveDayIndex(List<Map<String, Object>> dailies, double pickOpen,
                                              int startDay, double targetProfitPercent) {
        for (Map<String, Object> daily : dailies) {
            long dayIndex = (long) Math.rint(numOrZero(daily.get("day_index")));
            if (dayIndex < startDay) {
                continue;
            }
            double closePct = numOrZero(daily.get("total_change_percent"));
            double highPrice = numOrZero(daily.get("high_price"));
            Double highPct = null;
            if (highPrice > 0 && pickOpen > 0) {
                highPct = ((highPrice - pickOpen) / pickOpen) * 100.0;
            }
            Double best = highPct != null ? Math.max(highPct, closePct) : closePct;
            if (best >= targetProfitPercent) {
                return dayIndex;
            }
        }
        return null;
    }

    private static List<Map<String, Object>> buildInvestorStats(List<Map<String, Object>> subset, String todayStr,
                                                                Map<String, Map<String, Object>> effectiveByTracking) {
        Map<String, Map<String, Object>> senderStats = new LinkedHashMap<>();
        for (Map<String, Object> tracking : subset) {
            String sender = str(tracking.get("sender"));
            Map<String, Object> stat = senderStats.computeIfAbsent(sender, key -> {
                Map<String, Object> fresh = new LinkedHashMap<>();
                fresh.put("total", 0);
                fresh.put("win", 0);
                fresh.put("loss", 0);
                fresh.put("flat", 0);
                fresh.put("pending", 0);
                fresh.put("evaluated", 0);
                fresh.put("effWin", 0);
                fresh.put("effLoss", 0);
                fresh.put("effNoprize", 0);
                fresh.put("holdDays", new ArrayList<Long>());
                fresh.put("sumAvgChg", 0.0);
                fresh.put("count", 0);
                fresh.put("todayExcluded", 0);
                fresh.put("effectiveEvaluated", 0);
                return fresh;
            });
            stat.put("total", (int) stat.get("total") + 1);
            double totalChg = numOrZero(tracking.get("total_change_percent"));
            boolean isToday = str(tracking.get("pick_date")).equals(todayStr);
            if (isToday) {
                stat.put("todayExcluded", (int) stat.get("todayExcluded") + 1);
            }
            if (tracking.get("total_change_percent") == null) {
                stat.put("pending", (int) stat.get("pending") + 1);
                continue;
            }
            stat.put("evaluated", (int) stat.get("evaluated") + 1);

            int isEff;
            Long dayIdx;
            if (truthy(tracking.get("locked"))) {
                isEff = 1;
                dayIdx = longNum(tracking.get("effective_profit_day_index"));
            } else if (effectiveByTracking.containsKey(str(tracking.get("id")))) {
                Map<String, Object> state = effectiveByTracking.get(str(tracking.get("id")));
                isEff = (int) state.get("isEffective");
                dayIdx = (Long) state.get("dayIndex");
            } else {
                isEff = truthy(tracking.get("is_effective_profit")) ? 1 : 0;
                dayIdx = longNum(tracking.get("effective_profit_day_index"));
            }

            if (isEff != 0) {
                stat.put("win", (int) stat.get("win") + 1);
            } else if (totalChg < 0) {
                stat.put("loss", (int) stat.get("loss") + 1);
            } else {
                stat.put("flat", (int) stat.get("flat") + 1);
            }
            stat.put("sumAvgChg", (double) stat.get("sumAvgChg") + totalChg);
            stat.put("count", (int) stat.get("count") + 1);

            if (isToday) {
                continue;
            }
            stat.put("effectiveEvaluated", (int) stat.get("effectiveEvaluated") + 1);
            if (isEff != 0) {
                stat.put("effWin", (int) stat.get("effWin") + 1);
            } else if (totalChg > 0) {
                stat.put("effLoss", (int) stat.get("effLoss") + 1);
            } else {
                stat.put("effNoprize", (int) stat.get("effNoprize") + 1);
            }
            if (dayIdx != null) {
                @SuppressWarnings("unchecked")
                List<Long> holdDays = (List<Long>) stat.get("holdDays");
                holdDays.add(dayIdx);
            }
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (Map.Entry<String, Map<String, Object>> entry : senderStats.entrySet()) {
            if (entry.getKey().isEmpty()) {
                continue;
            }
            Map<String, Object> stat = entry.getValue();
            int total = (int) stat.get("total");
            int win = (int) stat.get("win");
            int loss = (int) stat.get("loss");
            int flat = (int) stat.get("flat");
            int pending = (int) stat.get("pending");
            int evaluated = (int) stat.get("evaluated");
            int effWin = (int) stat.get("effWin");
            int effLoss = (int) stat.get("effLoss");
            int effNoprize = (int) stat.get("effNoprize");
            int effectiveEvaluated = (int) stat.get("effectiveEvaluated");
            int count = (int) stat.get("count");
            double sumAvgChg = (double) stat.get("sumAvgChg");
            @SuppressWarnings("unchecked")
            List<Long> holdDays = (List<Long>) stat.get("holdDays");

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("sender", entry.getKey());
            item.put("totalPicks", total);
            item.put("winCount", win);
            item.put("lossCount", loss);
            item.put("flatCount", flat);
            item.put("pendingCount", pending);
            item.put("evaluatedCount", evaluated);
            item.put("winRate", evaluated > 0 ? round2((win * 100.0) / evaluated) : null);
            item.put("effectiveWinRate", effectiveEvaluated > 0 ? round2((effWin * 100.0) / effectiveEvaluated) : null);
            item.put("effectiveWinCount", effWin);
            item.put("effectiveLossCount", effLoss);
            item.put("effectiveNoprizeCount", effNoprize);
            item.put("effectiveEvaluatedCount", effectiveEvaluated);
            item.put("todayExcludedCount", stat.get("todayExcluded"));
            item.put("effectiveTestCount", effWin + effLoss);
            item.put("avgChangePercent", count > 0 ? round2(sumAvgChg / count) : null);
            if (holdDays.isEmpty()) {
                item.put("avgHoldDays", null);
            } else {
                long sum = 0;
                for (Long day : holdDays) {
                    sum += day;
                }
                item.put("avgHoldDays", round1(sum / (double) holdDays.size()));
            }
            item.put("hitCount", holdDays.size());
            result.add(item);
        }
        return result;
    }

    // ==================================================================
    // GET /api/wechat/investor/:sender/hold-days
    // ==================================================================

    public Map<String, Object> holdDays(String sender, Double targetProfit, Integer daysRaw) {
        int days = Math.max(1, Math.min(60, daysRaw == null ? 7 : daysRaw));
        Map<String, Object> empty = new LinkedHashMap<>();
        empty.put("avgHoldDays", null);
        empty.put("hitCount", 0);
        empty.put("totalPicks", 0);
        empty.put("sampleDays", new ArrayList<>());
        if (targetProfit == null || targetProfit.isNaN() || targetProfit <= 0) {
            return empty;
        }
        String sinceStr = LocalDate.now(BEIJING).minusDays(days).format(YMD);
        List<Map<String, Object>> tracks = trackingMapper.listIdsBySenderSince(sender, sinceStr);
        int totalPicks = tracks.size();
        if (totalPicks == 0) {
            return empty;
        }
        List<String> trackIds = new ArrayList<>();
        for (Map<String, Object> track : tracks) {
            trackIds.add(str(track.get("id")));
        }
        List<Map<String, Object>> dailyRows = trackingMapper.listDailyHitAmount(trackIds, targetProfit);
        Map<String, Long> firstHitDays = new LinkedHashMap<>();
        for (Map<String, Object> daily : dailyRows) {
            String tid = str(daily.get("tracking_id"));
            long dayIndex = (long) Math.rint(numOrZero(daily.get("day_index")));
            Long existing = firstHitDays.get(tid);
            if (existing == null || dayIndex < existing) {
                firstHitDays.put(tid, dayIndex);
            }
        }
        List<Long> sampleDays = new ArrayList<>(firstHitDays.values());
        int hitCount = sampleDays.size();
        Double avgHoldDays = null;
        if (hitCount > 0) {
            long sum = 0;
            for (Long day : sampleDays) {
                sum += day;
            }
            avgHoldDays = round1(sum / (double) hitCount);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("avgHoldDays", avgHoldDays);
        out.put("hitCount", hitCount);
        out.put("totalPicks", totalPicks);
        out.put("sampleDays", sampleDays);
        return out;
    }

    // ==================================================================
    // AI 补全逻辑 / 多图识别
    // ==================================================================

    /** 等价 autoFillStockLogic(eventId, messageText, stocks)：异步补全为空 logic 的股票。 */
    public void autoFillStockLogic(String eventId, String messageText, List<Map<String, Object>> stocks) {
        UserContext.CurrentUser user = UserContext.current();
        Thread thread = new Thread(() -> {
            UserContext.set(user);
            try {
                runAutoFillStockLogic(eventId, messageText, stocks);
            } catch (Exception ignored) {
                // AI补全逻辑失败
            } finally {
                UserContext.clear();
            }
        }, "wechat-autofill-logic");
        thread.setDaemon(true);
        thread.start();
    }

    private void runAutoFillStockLogic(String eventId, String messageText, List<Map<String, Object>> stocks) throws Exception {
        if (eventId == null || eventId.isEmpty() || messageText == null || messageText.isEmpty()
                || stocks == null || stocks.isEmpty()) {
            return;
        }
        List<Map<String, Object>> needFill = new ArrayList<>();
        for (Map<String, Object> stock : stocks) {
            if (stock != null && stock.get("code") != null && !truthy(stock.get("logic"))) {
                needFill.add(stock);
            }
        }
        if (needFill.isEmpty()) {
            return;
        }
        StringBuilder stockList = new StringBuilder();
        for (int i = 0; i < stocks.size(); i++) {
            if (i > 0) {
                stockList.append('、');
            }
            stockList.append(str(stocks.get(i).get("name"))).append('(').append(str(stocks.get(i).get("code"))).append(')');
        }
        String systemPrompt = "你是一个股票推荐逻辑提取助手。你的任务是从一段文本中，为每只股票提取其对应的推荐逻辑/理由。\n\n"
                + "要求：\n"
                + "1. 从原文中提取每只股票对应的推荐逻辑，逻辑必须是原文中出现的短语或关键词的组合\n"
                + "2. 如果原文中没有明确提到某只股票的推荐逻辑，则返回空字符串\n"
                + "3. 输出JSON数组格式：[{\"name\": \"股票名\", \"code\": \"代码\", \"logic\": \"提取的逻辑\", \"matched\": true/false}]\n"
                + "4. 推荐逻辑应简洁，提取原文中的关键短语，用\"+\"连接\n"
                + "5. 只输出JSON数组，不要其他文字说明\n"
                + "6. 如果某只股票找不到匹配的逻辑，logic设为空字符串，matched设为false\n"
                + "7. 不要编造或臆测逻辑，只从原文中提取真实存在的内容";
        String userPrompt = "原文：" + messageText + "\n\n需要提取的股票列表：" + stockList
                + "\n\n请从原文中为每只股票提取对应的推荐逻辑。";
        String result = aiCallService.callAI(systemPrompt, userPrompt, null, "agnes-2.0-flash", 30000, 2000);

        List<Map<String, Object>> aiResults = new ArrayList<>();
        try {
            Matcher matcher = JSON_ARRAY.matcher(result == null ? "" : result);
            if (matcher.find()) {
                aiResults = extractService.parseJsonList(matcher.group());
            }
        } catch (Exception ignored) {
            // 解析失败
        }
        if (aiResults.isEmpty()) {
            return;
        }

        boolean updated = false;
        for (Map<String, Object> ai : aiResults) {
            if (ai == null || ai.get("code") == null || !truthy(ai.get("logic"))) {
                continue;
            }
            String code = str(ai.get("code"));
            for (Map<String, Object> stock : stocks) {
                if (code.equals(str(stock.get("code"))) && !truthy(stock.get("logic"))) {
                    stock.put("logic", str(ai.get("logic")));
                    updated = true;
                    break;
                }
            }
        }

        if (updated) {
            eventMapper.updateStocksJson(eventId, extractService.toJson(stocks));
            Map<String, Object> memoryEvent = monitorState.findEvent(eventId);
            if (memoryEvent != null) {
                memoryEvent.put("stocks", stocks);
                memoryEvent.put("lastUpdated", System.currentTimeMillis());
            }
        }
    }

    /** 等价 callAIMultiImage(systemPrompt, userPrompt, imagePaths, model, timeoutMs, maxTokens)。 */
    public String callAIMultiImage(String systemPrompt, String userPrompt, List<String> imagePaths,
                                   String model, int timeoutMs, int maxTokens) throws Exception {
        long startTime = System.currentTimeMillis();
        AiCallService.PreparedModel prepared = aiCallService.prepareModel(model);
        boolean isGlm = prepared.isGlm();
        String provider = prepared.provider();
        String apiKey = prepared.apiKey();
        if (apiKey == null || apiKey.isEmpty()) {
            String message = "⚠️ 未配置 " + (isGlm ? "智谱GLM" : "Agnes") + " API Key，请在设置中配置。";
            try {
                Map<String, Object> log = new LinkedHashMap<>();
                log.put("model", model);
                log.put("provider", provider);
                log.put("systemPromptLen", systemPrompt.length());
                log.put("userPromptLen", userPrompt.length());
                log.put("responseLen", 0);
                log.put("durationMs", (int) (System.currentTimeMillis() - startTime));
                log.put("success", 0);
                log.put("errorMsg", message);
                log.put("requestContent", "[系统提示] " + systemPrompt + "\n\n[用户输入] " + userPrompt
                        + "\n[图片数] " + imagePaths.size());
                aiLogMapper.insertLog(log);
            } catch (Exception ignored) {
                // 日志写入失败
            }
            return message;
        }

        List<Map<String, Object>> contentParts = new ArrayList<>();
        contentParts.add(Map.of("type", "text", "text", userPrompt));
        long userId = UserContext.requireUserId();
        for (String imagePath : imagePaths) {
            try {
                Path fullPath = uploadService.resolveTenantPath(userId, imagePath);
                if (Files.exists(fullPath)) {
                    byte[] imageBytes = Files.readAllBytes(fullPath);
                    String ext = UploadService.extname(imagePath).toLowerCase(java.util.Locale.ROOT);
                    String mimeType = switch (ext) {
                        case ".jpg", ".jpeg" -> "image/jpeg";
                        case ".png" -> "image/png";
                        case ".gif" -> "image/gif";
                        case ".webp" -> "image/webp";
                        default -> "image/jpeg";
                    };
                    String dataUrl = "data:" + mimeType + ";base64,"
                            + java.util.Base64.getEncoder().encodeToString(imageBytes);
                    contentParts.add(Map.of("type", "image_url", "image_url", Map.of("url", dataUrl)));
                }
            } catch (Exception ignored) {
                // 单图读取失败跳过
            }
        }

        List<Map<String, Object>> messages = new ArrayList<>();
        Map<String, Object> systemMessage = new LinkedHashMap<>();
        systemMessage.put("role", "system");
        systemMessage.put("content", systemPrompt);
        messages.add(systemMessage);
        Map<String, Object> userMessage = new LinkedHashMap<>();
        userMessage.put("role", "user");
        userMessage.put("content", contentParts);
        messages.add(userMessage);

        String requestContent = "[系统提示] " + systemPrompt + "\n\n[用户输入] " + userPrompt
                + "\n[图片数] " + imagePaths.size();

        String content = "";
        boolean success = true;
        String errorMsg = "";
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("model", prepared.config().get("model"));
            payload.put("messages", messages);
            payload.put("temperature", 0.2);
            payload.put("max_tokens", maxTokens);
            if (isGlm) {
                payload.put("thinking", Map.of("type", "disabled"));
            }

            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            java.net.http.HttpRequest.Builder builder = java.net.http.HttpRequest.newBuilder(
                            java.net.URI.create(String.valueOf(prepared.config().get("url"))))
                    .timeout(Duration.ofMillis(timeoutMs))
                    .header("Content-Type", "application/json");
            if ("x-api-key".equals(prepared.config().get("authStyle"))) {
                builder.header("x-api-key", apiKey);
            } else {
                builder.header("Authorization", "Bearer " + apiKey);
            }
            builder.POST(java.net.http.HttpRequest.BodyPublishers.ofString(
                    mapper.writeValueAsString(payload), java.nio.charset.StandardCharsets.UTF_8));
            var response = aiCallService.httpClient().send(
                    builder.build(), java.net.http.HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                String errText = new String(response.body(), java.nio.charset.StandardCharsets.UTF_8);
                throw new IllegalStateException("AI API 请求失败 (" + response.statusCode() + "): " + errText);
            }
            Object data = mapper.readValue(response.body(), Object.class);
            if (data instanceof Map<?, ?> root && root.get("choices") instanceof List<?> choices && !choices.isEmpty()
                    && choices.get(0) instanceof Map<?, ?> choice && choice.get("message") instanceof Map<?, ?> msg) {
                Object messageContent = msg.get("content");
                content = messageContent == null ? "" : String.valueOf(messageContent);
                if ((content == null || content.trim().isEmpty()) && msg.get("reasoning_content") != null) {
                    content = String.valueOf(msg.get("reasoning_content"));
                }
                if (msg.get("content") instanceof List<?> parts) {
                    StringBuilder joined = new StringBuilder();
                    for (Object part : parts) {
                        if (part instanceof Map<?, ?> piece && piece.get("text") != null) {
                            joined.append(String.valueOf(piece.get("text")));
                        }
                    }
                    content = joined.length() == 0 ? "AI 未返回有效结果" : joined.toString();
                } else {
                    content = (content == null || content.isEmpty()) ? "AI 未返回有效结果" : content;
                }
            }
        } catch (Exception error) {
            success = false;
            errorMsg = error.getMessage() == null ? String.valueOf(error) : error.getMessage();
            throw error;
        } finally {
            try {
                Map<String, Object> log = new LinkedHashMap<>();
                log.put("model", prepared.resolvedModel());
                log.put("provider", provider);
                log.put("systemPromptLen", systemPrompt.length());
                log.put("userPromptLen", userPrompt.length());
                log.put("responseLen", content == null ? 0 : content.length());
                log.put("durationMs", (int) (System.currentTimeMillis() - startTime));
                log.put("success", success ? 1 : 0);
                log.put("errorMsg", errorMsg);
                log.put("requestContent", truncate(requestContent, 2000));
                log.put("responseContent", truncate(content == null ? "" : content, 2000));
                aiLogMapper.insertLog(log);
            } catch (Exception ignored) {
                // 日志写入失败
            }
            if (success) {
                try {
                    aiLogMapper.upsertUsage(LocalDate.now(ZoneOffset.UTC).format(YMD), prepared.resolvedModel());
                } catch (Exception ignored) {
                    // 统计失败
                }
            }
        }
        return content;
    }

    /** 等价 Node 端 callAIMultiImage 里的 truncate：超出补「...(已截断, 共N字符)」。 */
    private static String truncate(String value, int max) {
        if (value == null || value.isEmpty()) {
            return "";
        }
        return value.length() <= max ? value : value.substring(0, max) + "\n...(已截断, 共" + value.length() + "字符)";
    }

    /** 供 extract-image 上传：保存 multipart 图片到租户 stock 目录，返回相对路径。 */
    public String storeStockImage(long userId, MultipartFile file, String originalName) {
        String ext = UploadService.extname(originalName);
        if (ext.isEmpty()) {
            ext = ".png";
        }
        String filename = System.currentTimeMillis() + "-" + WechatExtractService.randomBase36(6) + ext;
        return uploadService.store(userId, "stock", file, filename, 10L * 1024 * 1024);
    }
}
