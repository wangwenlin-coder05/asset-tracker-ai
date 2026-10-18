package com.wangwenlin.stock.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.common.Utf8Js;
import com.wangwenlin.stock.config.AppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 打新日历（/api/newstock-calendar）。逐行对齐 Node 端 server.js 4019-4121：
 * 优先 spawn quant/newstock_calendar.py（akshare），失败回落同花顺直连；内存缓存 10 分钟，
 * 命中即返回旧数据 + 后台静默刷新，并发刷新合并为一次。
 */
@Service
public class IpoCalendarService {

    private static final Logger log = LoggerFactory.getLogger(IpoCalendarService.class);

    private static final long IPO_CALENDAR_TTL = 10 * 60 * 1000L;

    private static final String USER_AGENT = "Mozilla/5.0";
    private static final Pattern CHARSET = Pattern.compile("charset=([\\w-]+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern MAINTABLE = Pattern.compile(
            "<table[^>]+id=[\"']maintable[\"'][\\s\\S]*?<tbody[^>]*>([\\s\\S]*?)</tbody>",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern TR = Pattern.compile("<tr[^>]*>([\\s\\S]*?)</tr>", Pattern.CASE_INSENSITIVE);
    private static final Pattern TD = Pattern.compile("<td[^>]*>([\\s\\S]*?)</td>", Pattern.CASE_INSENSITIVE);
    private static final Pattern TAGS = Pattern.compile("<[^>]+>");
    private static final Pattern CODE6 = Pattern.compile("^\\d{6}$");

    private final AppProperties appProperties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final Object refreshLock = new Object();
    private final ExecutorService refresher = Executors.newCachedThreadPool(runnable -> {
        Thread thread = new Thread(runnable, "ipo-calendar-refresh");
        thread.setDaemon(true);
        return thread;
    });

    /** 对应 Node 端 _ipoCalendarCache：{ rows, source, at }。 */
    private volatile Map<String, Object> ipoCalendarCache;
    /** 对应 _ipoCalendarInflight：并发刷新合并为一次。 */
    private volatile CompletableFuture<Map<String, Object>> ipoCalendarInflight;

    public IpoCalendarService(AppProperties appProperties, ObjectMapper objectMapper) {
        this.appProperties = appProperties;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    // ==================== 入口 ====================

    public Map<String, Object> calendar() {
        Map<String, Object> cache = ipoCalendarCache;
        if (cache != null) {
            long age = System.currentTimeMillis() - toLong(cache.get("at"));
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("rows", cache.get("rows"));
            result.put("source", cache.get("source"));
            result.put("cached", true);
            result.put("ageMs", age);
            if (age >= IPO_CALENDAR_TTL) {
                // 过期时后台静默刷新，不影响本次旧数据返回
                startRefresh();
            }
            return result;
        }
        try {
            Map<String, Object> fresh = awaitRefresh();
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("rows", fresh.get("rows"));
            result.put("source", fresh.get("source"));
            return result;
        } catch (Exception error) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("error", "打新日历暂不可用");
            String detail = error.getMessage();
            if (detail != null) {
                body.put("detail", detail);
            }
            throw new ApiException(503, "打新日历暂不可用", body);
        }
    }

    /** 等价 Node 端 refreshIpoCalendar：单飞刷新，并发调用共享同一结果。 */
    private CompletableFuture<Map<String, Object>> startRefresh() {
        synchronized (refreshLock) {
            if (ipoCalendarInflight != null) {
                return ipoCalendarInflight;
            }
            CompletableFuture<Map<String, Object>> future = new CompletableFuture<>();
            ipoCalendarInflight = future;
            refresher.submit(() -> {
                try {
                    Map<String, Object> fresh = doRefresh();
                    ipoCalendarCache = fresh;
                    future.complete(fresh);
                } catch (Exception error) {
                    future.completeExceptionally(error);
                } finally {
                    synchronized (refreshLock) {
                        if (ipoCalendarInflight == future) {
                            ipoCalendarInflight = null;
                        }
                    }
                }
            });
            return future;
        }
    }

    private Map<String, Object> awaitRefresh() throws Exception {
        CompletableFuture<Map<String, Object>> future = startRefresh();
        try {
            return future.get();
        } catch (ExecutionException error) {
            Throwable cause = error.getCause();
            if (cause instanceof Exception exception) {
                throw exception;
            }
            throw new RuntimeException(cause);
        }
    }

    /** akshare 优先，失败回落同花顺直连。 */
    private Map<String, Object> doRefresh() throws Exception {
        try {
            Map<String, Object> akshare = fetchIpoCalendarFromAkshare();
            Object rows = akshare.get("rows");
            if (!(rows instanceof List<?> list) || list.isEmpty()) {
                throw new RuntimeException("akshare 无数据");
            }
            return cacheOf(rows, String.valueOf(akshare.get("source")));
        } catch (Exception akshareError) {
            log.warn("[IpoCalendar] akshare 不可用，改用同花顺直连：{}", akshareError.getMessage());
            List<Map<String, Object>> rows = fetchIpoCalendarFromThs();
            return cacheOf(rows, "10jqka");
        }
    }

    private static Map<String, Object> cacheOf(Object rows, String source) {
        Map<String, Object> cache = new LinkedHashMap<>();
        cache.put("rows", rows);
        cache.put("source", source);
        cache.put("at", System.currentTimeMillis());
        return cache;
    }

    // ==================== akshare（Python 子进程） ====================

    private Map<String, Object> fetchIpoCalendarFromAkshare() throws Exception {
        File root = projectRoot().toFile();
        File script = new File(root, "quant" + File.separator + "newstock_calendar.py");
        String pythonBin = System.getenv("PYTHON_BIN");
        if (pythonBin == null || pythonBin.isBlank()) {
            File venvPython = new File(root, "quant" + File.separator + ".venv" + File.separator
                    + "Scripts" + File.separator + "python.exe");
            pythonBin = venvPython.exists() ? venvPython.getAbsolutePath() : "python";
        }

        ProcessBuilder builder = new ProcessBuilder(pythonBin, script.getAbsolutePath());
        builder.directory(root);
        // 对齐 Node 端 spawn 的实际运行环境（见 MarketDataService.newsFromAkshare 的说明）
        Map<String, String> env = builder.environment();
        env.remove("PYTHONUTF8");
        env.remove("PYTHONIOENCODING");
        env.remove("PYTHONLEGACYWINDOWSSTDIO");
        env.remove("PYTHONLEGACYWINDOWSFSENCODING");
        Process process = builder.start();

        StringBuilder stdout = new StringBuilder();
        StringBuilder stderr = new StringBuilder();
        Thread stdoutReader = reader(process.getInputStream(), stdout);
        Thread stderrReader = reader(process.getErrorStream(), stderr);
        stdoutReader.start();
        stderrReader.start();

        if (!process.waitFor(30, TimeUnit.SECONDS)) {
            process.destroyForcibly();
            throw new RuntimeException("akshare 超时");
        }
        stdoutReader.join(2000);
        stderrReader.join(2000);

        int exitCode = process.exitValue();
        if (exitCode != 0) {
            String text = stderr.toString().trim();
            String lastLine = text.isEmpty() ? "" : lastNonEmptyLine(text);
            throw new RuntimeException(lastLine.isEmpty() ? ("akshare 退出码 " + exitCode) : lastLine);
        }

        Object parsed = objectMapper.readValue(stdout.toString(), Object.class);
        String source = "akshare";
        Matcher matcher = Pattern.compile("CALENDAR_SOURCE:(\\S+)").matcher(stderr.toString());
        if (matcher.find()) {
            source = matcher.group(1);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("rows", parsed);
        result.put("source", source);
        return result;
    }

    private static String lastNonEmptyLine(String text) {
        String[] lines = text.split("\n");
        return lines.length == 0 ? "" : lines[lines.length - 1];
    }

    private static Thread reader(InputStream stream, StringBuilder sink) {
        Thread thread = new Thread(() -> {
            try (InputStream in = stream) {
                sink.append(Utf8Js.decode(in.readAllBytes()));
            } catch (Exception ignored) {
                // 忽略
            }
        });
        thread.setDaemon(true);
        return thread;
    }

    // ==================== 同花顺直连 ====================

    private List<Map<String, Object>> fetchIpoCalendarFromThs() throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create("https://data.10jqka.com.cn/ipo/xgsgyzq/"))
                .timeout(Duration.ofSeconds(15))
                .header("User-Agent", USER_AGENT)
                .header("Accept", "text/html,application/xhtml+xml")
                .header("Referer", "https://data.10jqka.com.cn/")
                .GET()
                .build();
        HttpResponse<byte[]> response = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new RuntimeException("同花顺返回 HTTP " + response.statusCode());
        }
        byte[] buf = response.body();
        String contentType = response.headers().firstValue("content-type").orElse("");
        String charset = "utf-8";
        Matcher cs = CHARSET.matcher(contentType);
        if (cs.find()) {
            charset = cs.group(1);
        }
        String html = decode(buf, charset);
        // 如果解码后仍有大量乱码，回退到 GBK（同花顺常见编码）
        if (countReplacement(html) > 5) {
            html = decode(buf, "gbk");
        }
        return parseIpoCalendarHtml(html);
    }

    /** 对齐 WHATWG TextDecoder 的字符集映射（gbk 实为 GB18030 解码器）。 */
    private static String decode(byte[] bytes, String charsetName) {
        String normalized = charsetName == null ? "" : charsetName.trim().toLowerCase();
        Charset charset = switch (normalized) {
            case "gbk", "gb2312", "gb18030", "gb-2312", "x-gbk" -> Charset.forName("GB18030");
            case "big5", "big-5" -> Charset.forName("Big5");
            case "", "utf-8", "utf8" -> StandardCharsets.UTF_8;
            default -> Charset.forName(normalized);
        };
        return new String(bytes, charset);
    }

    private static int countReplacement(String html) {
        int count = 0;
        for (int i = 0; i < html.length(); i++) {
            if (html.charAt(i) == '\uFFFD') {
                count++;
            }
        }
        return count;
    }

    private List<Map<String, Object>> parseIpoCalendarHtml(String html) {
        List<Map<String, Object>> rows = new ArrayList<>();
        Matcher table = MAINTABLE.matcher(html == null ? "" : html);
        String body = table.find() ? table.group(1) : "";
        Matcher tr = TR.matcher(body);
        while (tr.find()) {
            List<String> cells = new ArrayList<>();
            Matcher td = TD.matcher(tr.group(1));
            while (td.find()) {
                cells.add(decodeCell(td.group(1)));
            }
            if (cells.size() < 11 || !CODE6.matcher(cells.get(0)).matches()) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("code", cells.get(0));
            row.put("name", cells.get(1));
            row.put("applyCode", cells.get(2));
            row.put("marketValue", cells.get(6));
            row.put("price", cells.get(7));
            row.put("date", cells.get(10));
            row.put("lotteryDate", cells.size() > 13 ? cells.get(13) : "");
            row.put("listingDate", cells.size() > 14 ? cells.get(14) : "");
            row.put("limit", cells.get(5));
            rows.add(row);
        }
        return rows;
    }

    /** 等价 Node 端 decode：先剥标签，再还原常见实体，最后压缩空白。 */
    private static String decodeCell(String value) {
        String text = TAGS.matcher(value == null ? "" : value).replaceAll(" ");
        text = text.replaceAll("(?i)&nbsp;|&#160;", " ")
                .replaceAll("(?i)&amp;", "&")
                .replaceAll("(?i)&lt;", "<")
                .replaceAll("(?i)&gt;", ">")
                .replaceAll("\\s+", " ");
        return text.trim();
    }

    private java.nio.file.Path projectRoot() {
        String configured = appProperties.getProjectDir();
        File dir = new File(configured == null || configured.isBlank() ? ".." : configured);
        return dir.getAbsoluteFile().toPath().normalize();
    }

    private static long toLong(Object value) {
        return value instanceof Number number ? number.longValue() : 0L;
    }
}
