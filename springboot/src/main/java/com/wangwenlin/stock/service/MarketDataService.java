package com.wangwenlin.stock.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wangwenlin.stock.common.Utf8Js;
import com.wangwenlin.stock.config.AppProperties;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * 外部行情数据源访问 —— 与 Node 端 server.js 中的同名辅助函数逐行对齐。
 * <ul>
 *   <<li>腾讯行情 GBK 解码（fetchGbkText / stockCodeToTencent）</li>
 *   <li>日 K 线落盘缓存 .cache/kline（fetchStockDailyHistory / fetchStockDailyHistoryRemote）</li>
 *   <li>个股资讯走 quant/stock_news.py 子进程（fetchNewsFromAkshare）</li>
 * </ul>
 * 缓存文件与 Node 端共用同一个 .cache/kline 目录与 JSON 结构，迁移期两侧互相预热。
 */
@Service
public class MarketDataService {

    private static final String USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
    /** Node 端用 TextDecoder('gbk')，其 WHATWG 实现即 GB18030 解码器。 */
    private static final Charset GBK = Charset.forName("GB18030");
    private static final ZoneId BEIJING = ZoneId.of("Asia/Shanghai");
    private static final long KLINE_CACHE_TTL = 10 * 60 * 1000L;

    private final AppProperties appProperties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public MarketDataService(AppProperties appProperties, ObjectMapper objectMapper) {
        this.appProperties = appProperties;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    // ==================== 基础工具 ====================

    /** 等价 Node 端 fetchGbkText：腾讯行情统一 GBK 编码。 */
    public String decodeGbk(byte[] bytes) {
        return new String(bytes, GBK);
    }

    /** 等价 Node 端 stockCodeToTencent。 */
    public String stockCodeToTencent(String code) {
        if (code == null || code.isEmpty()) {
            return "";
        }
        String value = code.trim();
        if (value.isEmpty()) {
            return "";
        }
        char first = value.charAt(0);
        if (first == '6' || first == '5' || first == '9') {
            return "sh" + value;
        }
        if (first == '0' || first == '3' || first == '1') {
            return "sz" + value;
        }
        if (first == '4' || first == '8') {
            return "bj" + value;
        }
        return "sh" + value;
    }

    public byte[] httpGetBytes(String url, Duration timeout) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .timeout(timeout)
                .header("User-Agent", USER_AGENT)
                .GET()
                .build();
        HttpResponse<byte[]> response = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
        return response.body();
    }

    /** 等价 Node 端 todayStr()（北京时间当天）。 */
    public String todayStr() {
        LocalDate date = LocalDate.now(BEIJING);
        return String.format("%04d-%02d-%02d", date.getYear(), date.getMonthValue(), date.getDayOfMonth());
    }

    public boolean isWeekend(String dateText) {
        LocalDate date = LocalDate.parse(dateText);
        DayOfWeek week = date.getDayOfWeek();
        return week == DayOfWeek.SATURDAY || week == DayOfWeek.SUNDAY;
    }

    /** 等价 Node 端 todayTradingStatus()：9:30 后开盘价可取，15:00 后收盘价锁定。 */
    public TradingStatus todayTradingStatus() {
        String dateText = todayStr();
        if (isWeekend(dateText)) {
            return new TradingStatus(false, false);
        }
        ZonedDateTime now = ZonedDateTime.now(BEIJING);
        int minutes = now.getHour() * 60 + now.getMinute();
        return new TradingStatus(minutes >= 9 * 60 + 30, minutes >= 15 * 60);
    }

    public record TradingStatus(boolean openAvailable, boolean closeFinal) {
    }

    // ==================== 日 K 线（本地缓存 + 腾讯接口） ====================

    /**
     * 优先读本地缓存；缺失或过期则从腾讯拉取并落盘；网络异常时退回旧缓存。
     * 与 Node 端 fetchStockDailyHistory 一致：缓存命中时忽略 days 参数。
     */
    public List<Map<String, Object>> stockDailyHistory(String stockCode, double days) throws Exception {
        CachedKline cached = readKlineCache(stockCode);
        if (cached != null && System.currentTimeMillis() - cached.savedAt < KLINE_CACHE_TTL) {
            return cached.bars;
        }
        try {
            List<Map<String, Object>> bars = stockDailyHistoryRemote(stockCode, days);
            if (!bars.isEmpty()) {
                writeKlineCache(stockCode, bars);
                return bars;
            }
            return cached == null ? new ArrayList<>() : cached.bars;
        } catch (Exception error) {
            if (cached != null) {
                return cached.bars;
            }
            throw error;
        }
    }

    public List<Map<String, Object>> stockDailyHistoryRemote(String stockCode, double days) throws Exception {
        String tencentCode = stockCodeToTencent(stockCode);
        if (tencentCode.isEmpty()) {
            return new ArrayList<>();
        }
        int count = (int) Math.max(days * 2, 320);
        String url = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param="
                + tencentCode + ",day,,," + count + ",qfq";

        Map<String, Object> json = null;
        Exception lastError = null;
        for (int attempt = 0; attempt < 2; attempt++) {
            try {
                byte[] bytes = httpGetBytes(url, Duration.ofSeconds(8));
                json = readMap(decodeGbk(bytes));
                lastError = null;
                break;
            } catch (Exception error) {
                lastError = error;
            }
        }
        if (lastError != null) {
            throw lastError;
        }

        Object codeField = json.get("code");
        if (isTruthy(codeField) && !isZeroNumber(codeField)) {
            return new ArrayList<>();
        }
        Object dataNode = child(json, "data", tencentCode);
        if (!(dataNode instanceof Map<?, ?> dataMap)) {
            return new ArrayList<>();
        }

        Object klines = dataMap.get("qfqday");
        if (!(klines instanceof List<?>)) {
            klines = dataMap.get("day");
        }
        List<Map<String, Object>> history = new ArrayList<>();
        if (klines instanceof List<?> rows) {
            for (Object row : rows) {
                if (!(row instanceof List<?> cells) || cells.size() < 6) {
                    continue;
                }
                Double open = number(cells.get(1));
                Double close = number(cells.get(2));
                Double high = number(cells.get(3));
                Double low = number(cells.get(4));
                Double volume = number(cells.get(5));
                if (close == null || !(close > 0)) {
                    continue;
                }
                Map<String, Object> bar = new LinkedHashMap<>();
                bar.put("date", cells.get(0));
                bar.put("open", open);
                bar.put("close", close);
                bar.put("high", high);
                bar.put("low", low);
                bar.put("volume", volume == null ? 0 : volume);
                history.add(bar);
            }
        }

        // ===== 补今日实时行情（K线接口只返回到上一个已收盘交易日）=====
        String today = todayStr();
        Map<String, Object> last = history.isEmpty() ? null : history.get(history.size() - 1);
        String lastDate = last == null ? null : String.valueOf(last.get("date"));
        TradingStatus status = todayTradingStatus();
        if (status.openAvailable() && (last == null || lastDate.compareTo(today) < 0)) {
            Object rtNode = dataMap.get("qt");
            if (rtNode instanceof Map<?, ?> qtMap) {
                Object rtValue = qtMap.get(tencentCode);
                if (rtValue instanceof List<?> rt && rt.size() >= 46) {
                    Double nowPrice = number(rt.get(3));
                    Double open = number(rt.get(5));
                    Double high = number(rt.get(33));
                    Double low = number(rt.get(34));
                    String updatedAt = rt.get(30) == null ? "" : String.valueOf(rt.get(30));
                    if (open != null && open > 0) {
                        Double todayClose = (nowPrice != null && nowPrice > 0) ? nowPrice : open;
                        Double highFinal = (high != null && high > 0) ? high : Math.max(open, todayClose);
                        Double lowFinal = (low != null && low > 0) ? low : Math.min(open, todayClose);
                        Double volume = number(rt.get(36));
                        Map<String, Object> bar = new LinkedHashMap<>();
                        bar.put("date", today);
                        bar.put("open", open);
                        bar.put("close", todayClose);
                        bar.put("high", highFinal);
                        bar.put("low", lowFinal);
                        bar.put("volume", volume == null ? 0 : volume);
                        bar.put("isRealTime", true);
                        bar.put("updatedAt", updatedAt);
                        history.add(bar);
                    }
                }
            }
        }
        return history;
    }

    private CachedKline readKlineCache(String stockCode) {
        try {
            Path path = klineCachePath(stockCode);
            if (!Files.exists(path)) {
                return null;
            }
            Map<String, Object> obj = readMap(Files.readString(path, StandardCharsets.UTF_8));
            Object bars = obj.get("bars");
            if (!(bars instanceof List<?> list) || list.isEmpty()) {
                return null;
            }
            long savedAt = 0L;
            Double parsed = number(obj.get("savedAt"));
            if (parsed != null) {
                savedAt = parsed.longValue();
            }
            List<Map<String, Object>> rows = new ArrayList<>(list.size());
            for (Object item : list) {
                if (item instanceof Map<?, ?>) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> row = (Map<String, Object>) item;
                    rows.add(row);
                }
            }
            return new CachedKline(savedAt, rows);
        } catch (Exception ignored) {
            return null;
        }
    }

    private void writeKlineCache(String stockCode, List<Map<String, Object>> bars) {
        try {
            Path path = klineCachePath(stockCode);
            Files.createDirectories(path.getParent());
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("savedAt", System.currentTimeMillis());
            payload.put("bars", bars);
            Files.writeString(path, objectMapper.writeValueAsString(payload), StandardCharsets.UTF_8);
        } catch (Exception ignored) {
            // 与 Node 端一致：缓存写失败静默忽略
        }
    }

    private Path klineCachePath(String stockCode) {
        String safe = stockCode == null ? "" : stockCode.replaceAll("[^0-9A-Za-z._-]", "");
        return projectRoot().resolve(".cache").resolve("kline").resolve(safe + ".json");
    }

    private record CachedKline(long savedAt, List<Map<String, Object>> bars) {
    }

    // ==================== 个股资讯（Python 子进程） ====================

    /** 等价 Node 端 fetchNewsFromAkshare：spawn quant/stock_news.py 并解析其 stdout。 */
    public Map<String, Object> newsFromAkshare(String code) throws Exception {
        File root = projectRoot().toFile();
        File script = new File(root, "quant" + File.separator + "stock_news.py");
        String pythonBin = System.getenv("PYTHON_BIN");
        if (pythonBin == null || pythonBin.isBlank()) {
            File venvPython = new File(root, "quant" + File.separator + ".venv" + File.separator
                    + "Scripts" + File.separator + "python.exe");
            pythonBin = venvPython.exists() ? venvPython.getAbsolutePath() : "python";
        }

        ProcessBuilder builder = new ProcessBuilder(pythonBin, script.getAbsolutePath(), code);
        builder.directory(root);
        // 关键：对齐 Node 端 spawn 的实际运行环境。子进程若处于 Python UTF-8 模式
        // （PYTHONUTF8 / PYTHONIOENCODING 生效时），curl_cffi 传给 libcurl 的 CA 证书路径会因
        // 含中文而无法打开，akshare 直接报 curl (77)，取数必然为空 —— Node 端进程没有这些变量，
        // 故此处显式剔除，保证两侧取到同一份数据（含 Node 端 stdout 按 UTF-8 解码产生的乱码表现）。
        Map<String, String> env = builder.environment();
        env.remove("PYTHONUTF8");
        env.remove("PYTHONIOENCODING");
        env.remove("PYTHONLEGACYWINDOWSSTDIO");
        env.remove("PYTHONLEGACYWINDOWSFSENCODING");
        Process process = builder.start();

        // Node 端 stdout/stderr 各自独立消费，此处同样需要并行排空 stderr，避免管道写满死锁。
        StringBuilder errorText = new StringBuilder();
        Thread errorReader = new Thread(() -> {
            try (InputStream stream = process.getErrorStream()) {
                errorText.append(new String(stream.readAllBytes(), StandardCharsets.UTF_8));
            } catch (Exception ignored) {
                // 忽略
            }
        });
        errorReader.setDaemon(true);
        errorReader.start();

        byte[] stdoutBytes;
        try (InputStream stream = process.getInputStream()) {
            stdoutBytes = stream.readAllBytes();
        }

        if (!process.waitFor(60, TimeUnit.SECONDS)) {
            process.destroyForcibly();
            throw new RuntimeException("timeout");
        }
        errorReader.join(2000);

        // 对齐 Node 的 Buffer→string：按 UTF-8 解码，且必须使用与 V8 一致的错误处理
        // （Java 内置解码器对 0xED 代理序列的处理不同，会让回包长度差一个字符）
        String out = Utf8Js.decode(stdoutBytes);
        String err = errorText.toString();
        int exitCode = process.exitValue();
        if (exitCode != 0 && out.isEmpty()) {
            throw new RuntimeException(err.isEmpty() ? ("stock_news.py exit " + exitCode) : err);
        }
        if (out.isEmpty()) {
            return new LinkedHashMap<>();
        }
        return readMap(out);
    }

    // ==================== 内部工具 ====================

    private Path projectRoot() {
        String configured = appProperties.getProjectDir();
        File dir = new File(configured == null || configured.isBlank() ? ".." : configured);
        return dir.getAbsoluteFile().toPath().normalize();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> readMap(String json) throws Exception {
        return objectMapper.readValue(json, LinkedHashMap.class);
    }

    private static Object child(Map<String, Object> node, String key, String nestedKey) {
        Object value = node.get(key);
        if (value instanceof Map<?, ?> map) {
            return map.get(nestedKey);
        }
        return null;
    }

    /** 等价 JS 真值判断。 */
    private static boolean isTruthy(Object value) {
        if (value == null) {
            return false;
        }
        if (value instanceof Boolean bool) {
            return bool;
        }
        if (value instanceof Number number) {
            double result = number.doubleValue();
            return result != 0d && !Double.isNaN(result);
        }
        if (value instanceof String text) {
            return !text.isEmpty();
        }
        return true;
    }

    /** 等价 JS {@code value !== 0}（严格不等于数字 0 时才算“非零”）。 */
    private static boolean isZeroNumber(Object value) {
        return value instanceof Number number && number.doubleValue() == 0d;
    }

    /** 等价 JS {@code Number(v)}：非数字返回 null。 */
    public static Double number(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Boolean bool) {
            return bool ? 1d : 0d;
        }
        if (value instanceof Number n) {
            double result = n.doubleValue();
            return Double.isFinite(result) ? result : null;
        }
        if (value instanceof String text) {
            String trimmed = text.trim();
            if (trimmed.isEmpty()) {
                return 0d;
            }
            try {
                double result = Double.parseDouble(trimmed);
                return Double.isFinite(result) ? result : null;
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }
}
