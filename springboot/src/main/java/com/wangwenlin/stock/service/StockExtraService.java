package com.wangwenlin.stock.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.common.Ids;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.mapper.StockDailySummaryMapper;
import com.wangwenlin.stock.mapper.StockExtraMapper;
import com.wangwenlin.stock.model.IpoStockRow;
import com.wangwenlin.stock.model.IpoTradeRow;
import com.wangwenlin.stock.model.StockDailySummaryRow;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 股票杂项 API —— 与 Node 端 server.js 中同名前缀路由逐行对齐（9 个路由）：
 * 个股资讯 / 情绪打分 / 批量日涨跌 / 打新底仓市值 / 盘后总结（读、写）/ 现价 / 名称查询 / 名称搜索。
 */
@Service
public class StockExtraService {

    private static final Logger log = LoggerFactory.getLogger(StockExtraService.class);

    /** 腾讯行情 v_xxx="..." 行格式 */
    private static final Pattern V_LINE = Pattern.compile("v_(\\w+)=\"([^\"]*)\"");
    private static final DateTimeFormatter ISO_MILLIS =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);

    /** 等价 Node 端 NEWS_TTL：1h，防东财封 IP。 */
    private static final long NEWS_TTL = 3600 * 1000L;

    private static final List<String> POS_WORDS = List.of(
            "增长", "上涨", "利好", "中标", "签约", "回购", "增持", "突破", "新高", "超预期",
            "盈利", "分红", "涨停", "放量", "机构买入", "北向加仓", "业绩预增", "订单", "合作");
    private static final List<String> NEG_WORDS = List.of(
            "下跌", "利空", "亏损", "违规", "处罚", "减持", "退市", "新低", "跌停", "缩量",
            "业绩预减", "质押", "立案", "调查", "退市风险", "商誉减值", "股东户数增加");

    private final MarketDataService marketDataService;
    private final StockExtraMapper stockExtraMapper;
    private final StockDailySummaryMapper summaryMapper;
    private final ObjectMapper objectMapper;

    /** 等价 Node 端 NEWS_CACHE（进程内、按 code 维度、1h TTL）。 */
    private final Map<String, NewsCacheEntry> newsCache = new ConcurrentHashMap<>();

    public StockExtraService(MarketDataService marketDataService,
                             StockExtraMapper stockExtraMapper,
                             StockDailySummaryMapper summaryMapper,
                             ObjectMapper objectMapper) {
        this.marketDataService = marketDataService;
        this.stockExtraMapper = stockExtraMapper;
        this.summaryMapper = summaryMapper;
        this.objectMapper = objectMapper;
    }

    // ==================== GET /api/stock/news/:code ====================

    public Map<String, Object> news(String code) {
        long now = System.currentTimeMillis();
        NewsCacheEntry cached = newsCache.get(code);
        if (cached != null && now - cached.time < NEWS_TTL) {
            return newsResponse(200, true, null, cached.data);
        }
        try {
            Map<String, Object> fresh = marketDataService.newsFromAkshare(code);
            newsCache.put(code, new NewsCacheEntry(fresh, now));
            return newsResponse(200, false, null, fresh);
        } catch (Exception error) {
            // 失败降级：有缓存就返回旧数据，明确标注
            NewsCacheEntry stale = newsCache.get(code);
            if (stale != null) {
                return newsResponse(200, true, true, stale.data);
            }
            log.error("个股资讯失败: {}", error.getMessage());
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("code", 503);
            body.put("error", error.getMessage());
            throw new ApiException(503, error.getMessage(), body);
        }
    }

    private static Map<String, Object> newsResponse(int code, boolean cached, Boolean stale, Object data) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", code);
        body.put("cached", cached);
        if (stale != null) {
            body.put("stale", stale);
        }
        body.put("data", data);
        return body;
    }

    // ==================== GET /api/stock/sentiment/:code ====================

    /**
     * 与 Node 端逐行对齐：先（必要时）取资讯并写入 NEWS_CACHE，再走打分。
     * 注意 quant/stock_news.py 返回的是 {news, notices, source}，没有 items 字段，
     * 因此 Node 端 {@code (items || []).slice(0, 20)} 会对普通对象调用 slice 而抛 TypeError，
     * 接口在正常路径下恒返回 500「(items || []).slice is not a function」；仅当 Python 取数失败
     * （此时 items 回落为空数组）才会返回 200 空列表。此处按原行为复刻，保证切换后前端表现不变。
     */
    public Map<String, Object> sentiment(String code) {
        long now = System.currentTimeMillis();
        NewsCacheEntry cached = newsCache.get(code);
        Object items;
        try {
            if (cached == null || now - cached.time >= NEWS_TTL) {
                Map<String, Object> fresh = marketDataService.newsFromAkshare(code);
                newsCache.put(code, new NewsCacheEntry(fresh, now));
                items = fresh.containsKey("items") ? fresh.get("items") : fresh;
            } else {
                items = cached.data.containsKey("items") ? cached.data.get("items") : cached.data;
            }
        } catch (Exception ignored) {
            // 对齐 Node 端内层 catch：NEWS_CACHE[code]?.data?.items || []
            NewsCacheEntry existing = newsCache.get(code);
            Object existingItems = existing == null ? null : existing.data.get("items");
            items = existingItems == null ? new ArrayList<>() : existingItems;
        }

        if (!(items instanceof List<?> candidates)) {
            throw new ApiException(500, "(items || []).slice is not a function");
        }

        List<Map<String, Object>> scored = new ArrayList<>();
        for (Object candidate : candidates.subList(0, Math.min(20, candidates.size()))) {
            if (!(candidate instanceof Map<?, ?> raw)) {
                continue;
            }
            String title = jsString(raw.get("title"));
            String summary = jsString(raw.get("summary"));
            String text = title + " " + summary;
            int pos = 0;
            int neg = 0;
            for (String word : POS_WORDS) {
                if (text.contains(word)) {
                    pos++;
                }
            }
            for (String word : NEG_WORDS) {
                if (text.contains(word)) {
                    neg++;
                }
            }
            Map<String, Object> item = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : raw.entrySet()) {
                item.put(String.valueOf(entry.getKey()), entry.getValue());
            }
            item.put("tone", pos > neg ? "bull" : neg > pos ? "bear" : "neutral");
            item.put("score", pos - neg);
            item.put("hitPos", pos);
            item.put("hitNeg", neg);
            scored.add(item);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", code);
        body.put("items", scored);
        body.put("at", System.currentTimeMillis());
        return body;
    }

    // ==================== POST /api/stock/daily-changes ====================

    public Map<String, Object> dailyChanges(Map<String, Object> body) {
        try {
            Object rawCodes = body.get("codes");
            Set<String> codes = new LinkedHashSet<>();
            if (rawCodes instanceof List<?> list) {
                for (Object raw : list) {
                    String value = jsString(JsValues.orEmptyValue(raw)).trim();
                    if (!value.isEmpty()) {
                        codes.add(value);
                    }
                }
            }
            List<String> codeList = new ArrayList<>(codes);
            if (codeList.size() > 60) {
                codeList = codeList.subList(0, 60);
            }

            Double daysValue = MarketDataService.number(body.get("days"));
            double daysRaw = (daysValue == null || daysValue == 0d) ? 90d : daysValue;
            double days = Math.min(Math.max(daysRaw, 10d), 250d);

            Map<String, Object> data = new LinkedHashMap<>();
            if (codeList.isEmpty()) {
                Map<String, Object> empty = new LinkedHashMap<>();
                empty.put("data", data);
                empty.put("fetchedAt", System.currentTimeMillis());
                return empty;
            }

            for (String code : codeList) {
                List<Map<String, Object>> series = new ArrayList<>();
                try {
                    List<Map<String, Object>> history = marketDataService.stockDailyHistory(code, days);
                    for (int i = 0; i < history.size(); i++) {
                        Map<String, Object> bar = history.get(i);
                        Double close = MarketDataService.number(bar.get("close"));
                        Double base = i > 0
                                ? MarketDataService.number(history.get(i - 1).get("close"))
                                : MarketDataService.number(bar.get("open"));
                        Map<String, Object> item = new LinkedHashMap<>();
                        item.put("date", bar.get("date"));
                        item.put("open", bar.get("open"));
                        item.put("close", bar.get("close"));
                        item.put("pct", (base != null && base > 0 && close != null)
                                ? round2(((close - base) / base) * 100) : null);
                        series.add(item);
                    }
                } catch (Exception error) {
                    series = new ArrayList<>();
                }
                data.put(code, series);
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("data", data);
            result.put("fetchedAt", System.currentTimeMillis());
            return result;
        } catch (Exception error) {
            log.error("获取日涨跌失败: {}", error.getMessage());
            throw new ApiException(500, "获取失败");
        }
    }

    // ==================== GET /api/stock/ipo-market-value ====================

    public Map<String, Object> ipoMarketValue() {
        try {
            return computeIpoMarketValue();
        } catch (ApiException api) {
            throw api;
        } catch (Exception error) {
            log.error("[IPO] 底仓市值计算失败: {}", error.getMessage());
            throw new ApiException(500, error.getMessage());
        }
    }

    private Map<String, Object> computeIpoMarketValue() {
        List<IpoStockRow> rows = stockExtraMapper.listIpoStocks();
        if (rows.isEmpty()) {
            return emptyIpoResult();
        }

        List<String> stockIds = new ArrayList<>(rows.size());
        for (IpoStockRow row : rows) {
            stockIds.add(row.getId());
        }

        Map<String, List<Map<String, Object>>> buyMap = groupTrades(stockExtraMapper.listIpoBuys(stockIds));
        Map<String, List<Map<String, Object>>> sellMap = groupTrades(stockExtraMapper.listIpoSells(stockIds));

        Map<String, StockHistory> stockHistory = new ConcurrentHashMap<>();
        ExecutorService pool = Executors.newFixedThreadPool(6);
        try {
            List<Future<?>> futures = new ArrayList<>();
            for (IpoStockRow row : rows) {
                String exchange = ipoExchange(row.getCode());
                if (exchange == null) {
                    continue;
                }
                futures.add(pool.submit(() -> {
                    try {
                        List<Map<String, Object>> history = marketDataService.stockDailyHistory(row.getCode(), 60d);
                        stockHistory.put(row.getId(), new StockHistory(
                                exchange,
                                history,
                                buyMap.getOrDefault(row.getId(), List.of()),
                                sellMap.getOrDefault(row.getId(), List.of())));
                    } catch (Exception error) {
                        log.error("[IPO] 获取 {} 日线失败: {}", row.getCode(), error.getMessage());
                    }
                }));
            }
            for (Future<?> future : futures) {
                future.get();
            }
        } catch (Exception error) {
            log.error("[IPO] 日线拉取异常: {}", error.getMessage());
        } finally {
            pool.shutdown();
            try {
                pool.awaitTermination(5, TimeUnit.SECONDS);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
        }

        // 以第一只有数据的股票的交易日历为基准（所有 A 股交易日历一致）
        List<String> tradeDays = new ArrayList<>();
        for (StockHistory history : stockHistory.values()) {
            if (!history.history().isEmpty()) {
                for (Map<String, Object> bar : history.history()) {
                    tradeDays.add(String.valueOf(bar.get("date")));
                }
                break;
            }
        }
        if (tradeDays.isEmpty()) {
            return emptyIpoResult();
        }

        // T-2：取倒数第 3 个交易日；20 日窗口 [t2Index - 19, t2Index]
        int t2Index = Math.max(0, tradeDays.size() - 3);
        String t2Date = tradeDays.get(t2Index);
        int windowStart = Math.max(0, t2Index - 19);
        List<String> windowDays = tradeDays.subList(windowStart, t2Index + 1);

        // 每个交易日按交易所汇总持仓市值
        Map<String, double[]> daily = new HashMap<>();
        for (StockHistory history : stockHistory.values()) {
            Map<String, Double> closeMap = new HashMap<>();
            for (Map<String, Object> bar : history.history()) {
                closeMap.put(String.valueOf(bar.get("date")), MarketDataService.number(bar.get("close")));
            }
            List<Map<String, Object>> buys = sortedByDate(history.buys());
            List<Map<String, Object>> sells = sortedByDate(history.sells());
            double cumBuy = 0d;
            double cumSell = 0d;
            int bi = 0;
            int si = 0;
            for (String day : windowDays) {
                while (bi < buys.size() && String.valueOf(buys.get(bi).get("date")).compareTo(day) <= 0) {
                    cumBuy += tradeCount(buys.get(bi));
                    bi++;
                }
                while (si < sells.size() && String.valueOf(sells.get(si).get("date")).compareTo(day) <= 0) {
                    cumSell += tradeCount(sells.get(si));
                    si++;
                }
                double shares = Math.max(0d, cumBuy - cumSell);
                Double close = closeMap.get(day);
                if (shares > 0 && close != null && close > 0) {
                    double[] slot = daily.computeIfAbsent(day, key -> new double[3]);
                    slot[exchangeIndex(history.exchange())] += shares * close;
                }
            }
        }

        double shSum = 0d;
        double szSum = 0d;
        double bjSum = 0d;
        List<Map<String, Object>> shDaily = new ArrayList<>();
        List<Map<String, Object>> szDaily = new ArrayList<>();
        List<Map<String, Object>> bjDaily = new ArrayList<>();
        for (String day : windowDays) {
            double[] slot = daily.getOrDefault(day, new double[3]);
            shSum += slot[0];
            szSum += slot[1];
            bjSum += slot[2];
            shDaily.add(dailyPoint(day, slot[0]));
            szDaily.add(dailyPoint(day, slot[1]));
            bjDaily.add(dailyPoint(day, slot[2]));
        }
        double count = windowDays.isEmpty() ? 1d : windowDays.size();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("sh", jsRound2(shSum / count * 100));
        result.put("sz", jsRound2(szSum / count * 100));
        result.put("bj", jsRound2(bjSum / count * 100));
        result.put("shDaily", shDaily);
        result.put("szDaily", szDaily);
        result.put("bjDaily", bjDaily);
        result.put("avgDays", windowDays.size());
        result.put("t2Date", t2Date);
        result.put("fetchedAt", System.currentTimeMillis());
        return result;
    }

    private static Map<String, Object> emptyIpoResult() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("sh", 0);
        result.put("sz", 0);
        result.put("bj", 0);
        result.put("shDaily", new ArrayList<>());
        result.put("szDaily", new ArrayList<>());
        result.put("bjDaily", new ArrayList<>());
        result.put("avgDays", 0);
        result.put("t2Date", "");
        result.put("fetchedAt", System.currentTimeMillis());
        return result;
    }

    private static Map<String, Object> dailyPoint(String date, double value) {
        Map<String, Object> point = new LinkedHashMap<>();
        point.put("date", date);
        point.put("value", value);
        return point;
    }

    private static Map<String, List<Map<String, Object>>> groupTrades(List<IpoTradeRow> rows) {
        Map<String, List<Map<String, Object>>> grouped = new LinkedHashMap<>();
        for (IpoTradeRow row : rows) {
            Map<String, Object> trade = new LinkedHashMap<>();
            trade.put("date", row.getDate());
            trade.put("count", row.getCount() == null ? 0d : row.getCount());
            grouped.computeIfAbsent(row.getStockId(), key -> new ArrayList<>()).add(trade);
        }
        return grouped;
    }

    private static List<Map<String, Object>> sortedByDate(List<Map<String, Object>> trades) {
        List<Map<String, Object>> sorted = new ArrayList<>(trades);
        sorted.sort(Comparator.comparing(trade -> String.valueOf(trade.get("date"))));
        return sorted;
    }

    private static double tradeCount(Map<String, Object> trade) {
        Double count = MarketDataService.number(trade.get("count"));
        return count == null ? 0d : count;
    }

    /** 等价 Node 端 ipoExchange：沪 60/68、深 00/30、北 4/8。 */
    private static String ipoExchange(String code) {
        String value = code == null ? "" : code.trim();
        if (value.startsWith("60") || value.startsWith("68")) {
            return "sh";
        }
        if (value.startsWith("00") || value.startsWith("30")) {
            return "sz";
        }
        if (value.startsWith("4") || value.startsWith("8")) {
            return "bj";
        }
        return null;
    }

    private static int exchangeIndex(String exchange) {
        return switch (exchange) {
            case "sh" -> 0;
            case "sz" -> 1;
            default -> 2;
        };
    }

    private record StockHistory(String exchange, List<Map<String, Object>> history,
                                List<Map<String, Object>> buys, List<Map<String, Object>> sells) {
    }

    // ==================== GET / PUT /api/stock/daily-summary ====================

    public Map<String, Object> getDailySummary(String rawDate) {
        try {
            String date = jsString(JsValues.orEmptyValue(rawDate)).trim();
            if (date.isEmpty()) {
                throw ApiException.badRequest("日期不能为空");
            }
            List<StockDailySummaryRow> rows = summaryMapper.listByDate(date);
            if (rows.isEmpty()) {
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("date", date);
                body.put("content", "");
                body.put("autoContent", "");
                body.put("createdAt", 0L);
                body.put("updatedAt", 0L);
                return body;
            }
            StockDailySummaryRow row = rows.get(0);
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("date", row.getDate());
            body.put("content", row.getContent() == null ? "" : row.getContent());
            body.put("autoContent", row.getAutoContent() == null ? "" : row.getAutoContent());
            body.put("createdAt", row.getCreatedAt());
            body.put("updatedAt", row.getUpdatedAt());
            return body;
        } catch (ApiException api) {
            throw api;
        } catch (Exception error) {
            log.error("获取盘后总结失败: {}", error.getMessage());
            throw new ApiException(500, "获取失败");
        }
    }

    public Map<String, Object> saveDailySummary(Map<String, Object> body) {
        try {
            String date = jsString(JsValues.orEmptyValue(body.get("date"))).trim();
            if (date.isEmpty()) {
                throw ApiException.badRequest("日期不能为空");
            }
            Object rawContent = body.get("content");
            Object rawAutoContent = body.get("autoContent");
            String content = rawContent == null ? "" : jsString(rawContent);
            String autoContent = rawAutoContent == null ? "" : jsString(rawAutoContent);
            long now = System.currentTimeMillis();

            List<String> existingIds = summaryMapper.listIdsByDate(date);
            if (!existingIds.isEmpty()) {
                String id = existingIds.get(0);
                Map<String, Object> data = new LinkedHashMap<>();
                data.put("content", content);
                data.put("autoContent", autoContent);
                data.put("updatedAt", now);
                data.put("id", id);
                summaryMapper.updateContent(data);

                Map<String, Object> result = new LinkedHashMap<>();
                result.put("ok", true);
                result.put("id", id);
                return result;
            }

            String id = Ids.uuid();
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("id", id);
            data.put("date", date);
            data.put("content", content);
            data.put("autoContent", autoContent);
            data.put("createdAt", now);
            data.put("updatedAt", now);
            summaryMapper.insert(data);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("ok", true);
            result.put("id", id);
            return result;
        } catch (ApiException api) {
            throw api;
        } catch (Exception error) {
            log.error("保存盘后总结失败: {}", error.getMessage());
            throw new ApiException(500, "保存失败");
        }
    }

    // ==================== GET /api/stock-price ====================

    public Map<String, Object> stockPrice(String rawCodes) {
        List<String> codes = new ArrayList<>();
        for (String part : (rawCodes == null ? "" : rawCodes).split(",", -1)) {
            String value = part.trim();
            if (!value.isEmpty()) {
                codes.add(value);
            }
        }
        if (codes.isEmpty()) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("data", new LinkedHashMap<>());
            body.put("source", "tencent");
            body.put("fetchedAt", isoMillis());
            return body;
        }
        if (codes.size() > 50) {
            throw ApiException.badRequest("单次最多50只");
        }

        List<String> tencentCodes = new ArrayList<>();
        for (String code : codes) {
            tencentCodes.add(marketDataService.stockCodeToTencent(code));
        }

        try {
            String text = "";
            for (int attempt = 0; attempt < 2; attempt++) {
                try {
                    byte[] bytes = marketDataService.httpGetBytes(
                            "https://qt.gtimg.cn/q=" + String.join(",", tencentCodes), Duration.ofSeconds(8));
                    text = marketDataService.decodeGbk(bytes);
                    if (!text.isEmpty() && text.contains("v_")) {
                        break;
                    }
                } catch (Exception error) {
                    if (attempt == 1) {
                        throw error;
                    }
                }
            }

            Map<String, Object> result = new LinkedHashMap<>();
            for (String line : text.split("\n", -1)) {
                if (line.isEmpty()) {
                    continue;
                }
                Matcher matcher = V_LINE.matcher(line);
                if (!matcher.find()) {
                    continue;
                }
                String[] fields = matcher.group(2).split("~", -1);
                if (fields.length < 35) {
                    continue;
                }
                String code = fields[2].replaceAll("^(sh|sz|bj)", "");
                Double price = MarketDataService.number(fields[3]);
                if (price == null || !(price > 0)) {
                    continue;
                }
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("price", price);
                item.put("prevClose", MarketDataService.number(fields[4]));
                item.put("change", MarketDataService.number(fields[31]));
                item.put("changePercent", MarketDataService.number(fields[32]));
                item.put("high", MarketDataService.number(fields[33]));
                item.put("low", MarketDataService.number(fields[34]));
                item.put("open", MarketDataService.number(fields[5]));
                item.put("name", fields[1]);
                item.put("updatedAt", fields[30].isEmpty() ? "" : fields[30]);
                result.put(code, item);
            }

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("data", result);
            body.put("source", "tencent");
            body.put("fetchedAt", isoMillis());
            return body;
        } catch (Exception error) {
            log.error("stock-price failed: {}", error.getMessage());
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("data", new LinkedHashMap<>());
            body.put("source", "tencent");
            body.put("error", "unavailable");
            body.put("message", error.getMessage());
            body.put("fetchedAt", isoMillis());
            return body;
        }
    }

    // ==================== GET /api/stock/name/:code ====================

    public Map<String, Object> stockName(String rawCode) {
        String code = rawCode == null ? "" : rawCode.trim();
        if (!code.matches("\\d{6}")) {
            throw ApiException.badRequest("股票代码必须为6位数字");
        }
        String tencentCode = marketDataService.stockCodeToTencent(code);
        if (tencentCode.isEmpty()) {
            throw ApiException.badRequest("无效的股票代码");
        }
        try {
            byte[] bytes = marketDataService.httpGetBytes(
                    "https://qt.gtimg.cn/q=" + tencentCode, Duration.ofSeconds(5));
            String text = marketDataService.decodeGbk(bytes);
            Matcher matcher = V_LINE.matcher(text);
            if (!matcher.find()) {
                Map<String, Object> empty = new LinkedHashMap<>();
                empty.put("code", code);
                empty.put("name", "");
                return empty;
            }
            String[] fields = matcher.group(2).split("~", -1);
            String name = fields.length > 1 ? fields[1] : "";
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("code", code);
            body.put("name", name);
            return body;
        } catch (Exception error) {
            log.error("stock name lookup failed: {}", error.getMessage());
            throw queryFailure(error);
        }
    }

    // ==================== GET /api/stock/search ====================

    public Map<String, Object> searchByName(String rawName) {
        String name = rawName == null ? "" : rawName.trim();
        if (name.isEmpty() || name.length() < 2) {
            throw ApiException.badRequest("名称至少2个字符");
        }
        try {
            String url = "https://searchapi.eastmoney.com/api/suggest/get?input="
                    + URLEncoder.encode(name, StandardCharsets.UTF_8)
                    + "&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=5";
            byte[] bytes = marketDataService.httpGetBytes(url, Duration.ofSeconds(5));
            Map<String, Object> json = objectMapper.readValue(
                    new String(bytes, StandardCharsets.UTF_8), LinkedHashMap.class);

            List<Map<String, Object>> results = new ArrayList<>();
            Object table = json.get("QuotationCodeTable");
            if (table instanceof Map<?, ?> tableMap && tableMap.get("Data") instanceof List<?> dataList) {
                for (Object item : dataList) {
                    if (!(item instanceof Map<?, ?> row)) {
                        continue;
                    }
                    String code = jsString(JsValues.orEmptyValue(row.get("Code")));
                    if (code.isEmpty() || !code.matches("\\d{6}")) {
                        continue;
                    }
                    Map<String, Object> result = new LinkedHashMap<>();
                    result.put("code", code);
                    result.put("name", jsString(JsValues.orEmptyValue(row.get("Name"))));
                    result.put("market", jsString(JsValues.orEmptyValue(row.get("Market"))));
                    results.add(result);
                }
            }

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("results", results);
            return body;
        } catch (Exception error) {
            log.error("stock search failed: {}", error.getMessage());
            throw queryFailure(error);
        }
    }

    // ==================== 内部工具 ====================

    /** 对齐 Node 端 res.status(503).json({ error: '查询失败', message: err.message })。 */
    private static ApiException queryFailure(Exception error) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", "查询失败");
        if (error.getMessage() != null) {
            body.put("message", error.getMessage());
        }
        return new ApiException(503, "查询失败", body);
    }

    /** 等价 JS {@code Number((x).toFixed(2))}；非有限值在 JS 里最终落为 JSON null。 */
    private static Double round2(double value) {
        if (!Double.isFinite(value)) {
            return null;
        }
        return new BigDecimal(value).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }

    /** 等价 JS {@code Math.round(x) / 100}（用于市值汇总，均为非负数）。 */
    private static Double jsRound2(double value) {
        return Math.round(value) / 100d;
    }

    /** 等价 JS {@code String(v)}：整数值的 Double 不输出 .0。 */
    private static String jsString(Object value) {
        if (value == null) {
            return "";
        }
        if (value instanceof Double number && Double.isFinite(number)
                && number == Math.floor(number) && Math.abs(number) < 1e15) {
            return String.valueOf(number.longValue());
        }
        if (value instanceof Boolean bool) {
            return bool ? "true" : "false";
        }
        return String.valueOf(value);
    }

    private static String isoMillis() {
        return ISO_MILLIS.format(Instant.now());
    }

    private record NewsCacheEntry(Map<String, Object> data, long time) {
    }
}
