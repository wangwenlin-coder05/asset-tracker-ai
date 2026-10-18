package com.wangwenlin.stock.service;

import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.config.AppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * 量化服务（quant/，Python + FastAPI，默认 8000 端口）的启停与状态控制。
 * 逐行对齐 Node 端 server.js 1207-1305 的实现：子进程保活、日志环形缓冲、
 * 端口探测、以及「先 ping 再判进程存活」的启动等待逻辑。
 */
@Service
public class QuantServiceManager {

    private static final Logger log = LoggerFactory.getLogger(QuantServiceManager.class);
    /** 启动等待上限，对齐 Node 端 20s。 */
    private static final long START_DEADLINE_MILLIS = 20000L;
    private static final int LOG_CAPACITY = 200;

    private final int quantPort;
    private final File quantDir;
    private final File quantPython;
    private final String aiLogUrl;
    private final HttpClient httpClient;
    private final Deque<String> quantLogs = new ArrayDeque<>();
    private final AiSettingsService settingsService;

    private volatile Process quantProc;

    public QuantServiceManager(AppProperties appProperties, AiSettingsService settingsService,
                               @Value("${server.port:8088}") int serverPort) {
        this.settingsService = settingsService;
        this.quantPort = resolveQuantPort();
        String configured = appProperties.getProjectDir();
        File dir = new File(configured == null || configured.isBlank() ? ".." : configured);
        Path root = dir.getAbsoluteFile().toPath().normalize();
        this.quantDir = new File(root.toFile(), "quant");
        this.quantPython = new File(quantDir, ".venv" + File.separator + "Scripts" + File.separator + "python.exe");
        this.aiLogUrl = "http://127.0.0.1:" + serverPort + "/api/ai/logs";
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(1)).build();
    }

    /** 对齐 Node 端 {@code Number(process.env.QUANT_PORT) || 8000}。 */
    private static int resolveQuantPort() {
        String raw = System.getenv("QUANT_PORT");
        if (raw == null || raw.isBlank()) {
            return 8000;
        }
        try {
            double parsed = Double.parseDouble(raw.trim());
            if (!Double.isFinite(parsed) || parsed == 0d) {
                return 8000;
            }
            return (int) parsed;
        } catch (NumberFormatException ignored) {
            return 8000;
        }
    }

    /** GET /api/quant-service/status */
    public Map<String, Object> status() {
        boolean running = ping(1500);
        boolean aiReady = false;
        try {
            aiReady = JsValues.truthy(settingsService.getUserSecret("glm_api_key"));
        } catch (Exception error) {
            aiReady = false;
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("running", running);
        result.put("port", quantPort);
        result.put("managed", isManaged());
        result.put("aiReady", aiReady);
        return result;
    }

    /** POST /api/quant-service/start */
    public Map<String, Object> start() {
        if (ping(1500)) {
            return startedMessage("量化服务已在运行");
        }
        if (!quantPython.exists()) {
            throw new ApiException(400, null, errorBody("未找到虚拟环境：" + quantPython.getAbsolutePath()));
        }
        // 注入 GLM Key，让量化服务里的 AI 策略生成/改进无需手动配环境变量
        String glmKey = "";
        try {
            glmKey = JsValues.orEmpty(settingsService.getUserSecret("glm_api_key"));
        } catch (Exception ignored) {
            glmKey = "";
        }

        Process process;
        try {
            ProcessBuilder builder = new ProcessBuilder(
                    quantPython.getAbsolutePath(), "-m", "uvicorn", "quant.api:app", "--port", String.valueOf(quantPort));
            builder.directory(quantDir);
            builder.redirectErrorStream(true);
            Map<String, String> environment = builder.environment();
            environment.put("GLM_API_KEY", glmKey);
            environment.put("AGNES_API_KEY", "");
            environment.put("ALAPI_TOKEN", "");
            // 量化服务里的 AI 调用（策略生成/改进）回传日志到本服务，写入 ai_logs
            environment.put("AI_LOG_URL", aiLogUrl);
            process = builder.start();
        } catch (Exception error) {
            throw new ApiException(500, null, errorBody("启动失败：" + error.getMessage()));
        }

        quantProc = process;
        startLogPump(process);
        process.onExit().thenAccept(exited -> {
            if (quantProc == exited) {
                quantProc = null;
            }
        });

        long deadline = System.currentTimeMillis() + START_DEADLINE_MILLIS;
        while (System.currentTimeMillis() < deadline) {
            if (ping(1000)) {
                return startedMessage("量化服务已启动");
            }
            if (!process.isAlive()) {
                break;
            }
            try {
                Thread.sleep(500);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        Map<String, Object> timeout = new LinkedHashMap<>();
        timeout.put("success", false);
        timeout.put("error", "启动超时");
        timeout.put("log", lastLogs(20));
        throw new ApiException(504, null, timeout);
    }

    /** POST /api/quant-service/stop */
    public Map<String, Object> stop() {
        boolean killed = false;
        Process process = quantProc;
        if (process != null && process.isAlive()) {
            killPid(String.valueOf(process.pid()));
            killed = true;
        }
        for (String pid : portPids()) {
            killPid(pid);
            killed = true;
        }
        quantProc = null;
        boolean stillUp = ping(1000);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("running", stillUp);
        result.put("killed", killed);
        result.put("message", stillUp ? "仍有进程占用端口" : "量化服务已停止");
        return result;
    }

    // ==================== 内部工具 ====================

    private boolean isManaged() {
        Process process = quantProc;
        return process != null && process.isAlive();
    }

    /** 对齐 Node 端 pingQuant：GET /api/ping，2xx~4xx 视为在跑。 */
    private boolean ping(long timeoutMillis) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + quantPort + "/api/ping"))
                    .timeout(Duration.ofMillis(timeoutMillis))
                    .GET()
                    .build();
            HttpResponse<Void> response = httpClient.send(request, HttpResponse.BodyHandlers.discarding());
            int status = response.statusCode();
            return status >= 200 && status < 500;
        } catch (Exception error) {
            return false;
        }
    }

    /** 对齐 Node 端 quantPortPids：查监听该端口的进程号，出错即空数组。 */
    private List<String> portPids() {
        Process process = null;
        try {
            ProcessBuilder builder = new ProcessBuilder("powershell", "-NoProfile", "-Command",
                    "Get-NetTCPConnection -State Listen -LocalPort " + quantPort
                            + " -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique");
            builder.redirectError(ProcessBuilder.Redirect.DISCARD);
            process = builder.start();
            Process running = process;
            StringBuilder stdout = new StringBuilder();
            Thread reader = new Thread(() -> {
                try (InputStream stream = running.getInputStream()) {
                    stdout.append(new String(stream.readAllBytes(), StandardCharsets.US_ASCII));
                } catch (Exception ignored) {
                    // 忽略
                }
            });
            reader.setDaemon(true);
            reader.start();
            if (!process.waitFor(8, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                return List.of();
            }
            reader.join(1000);
            Set<String> pids = new LinkedHashSet<>();
            for (String token : stdout.toString().split("\\s+")) {
                if (!token.isEmpty() && token.chars().allMatch(Character::isDigit)) {
                    pids.add(token);
                }
            }
            return new ArrayList<>(pids);
        } catch (Exception error) {
            if (process != null) {
                process.destroyForcibly();
            }
            return List.of();
        }
    }

    private void killPid(String pid) {
        try {
            ProcessBuilder builder = new ProcessBuilder("taskkill", "/PID", pid, "/T", "/F");
            builder.redirectError(ProcessBuilder.Redirect.DISCARD);
            builder.redirectOutput(ProcessBuilder.Redirect.DISCARD);
            Process process = builder.start();
            if (!process.waitFor(8, TimeUnit.SECONDS)) {
                process.destroyForcibly();
            }
        } catch (Exception ignored) {
            // 对齐 Node 端：kill 结果不参与回包
        }
    }

    /** 对齐 Node 端 quantProc.stdout/stderr 的 pushQuantLog：按行 trim、跳过空行、环形保留 200 条。 */
    private void startLogPump(Process process) {
        Thread reader = new Thread(() -> {
            try (InputStream stream = process.getInputStream()) {
                byte[] buffer = new byte[4096];
                int read;
                while ((read = stream.read(buffer)) > 0) {
                    pushLog(new String(buffer, 0, read, StandardCharsets.UTF_8));
                }
            } catch (Exception ignored) {
                // 进程结束即退出
            }
        });
        reader.setDaemon(true);
        reader.start();
    }

    private void pushLog(String chunk) {
        for (String rawLine : chunk.split("\r?\n")) {
            if (rawLine.trim().isEmpty()) {
                continue;
            }
            synchronized (quantLogs) {
                quantLogs.addLast(rawLine.trim());
                while (quantLogs.size() > LOG_CAPACITY) {
                    quantLogs.removeFirst();
                }
            }
        }
    }

    private List<String> lastLogs(int count) {
        synchronized (quantLogs) {
            List<String> all = new ArrayList<>(quantLogs);
            return all.size() <= count ? all : new ArrayList<>(all.subList(all.size() - count, all.size()));
        }
    }

    private static Map<String, Object> startedMessage(String message) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("running", true);
        result.put("message", message);
        return result;
    }

    private static Map<String, Object> errorBody(String message) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", false);
        result.put("error", message);
        return result;
    }
}
