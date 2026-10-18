package com.wangwenlin.stock.service;

import com.wangwenlin.stock.mapper.WechatEventMapper;
import com.wangwenlin.stock.tenant.UserContext;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * 微信窗口监听进程管理 + 启动初始化（initEventsFromDb / senderRetry）。
 * 等价 wechat-extractor.js 的 startWechatMonitor/stopWechatMonitor/getWechatMonitorStatus/
 * handleMonitorLine/pushMonitorEvent/initEventsFromDb/startSenderRetryJob/runSenderRetry。
 */
@Service
public class WechatMonitorService {

    private final WechatMonitorState monitorState;
    private final WechatExtractService extractService;
    private final WechatEventMapper eventMapper;
    private final WechatTrackingService trackingService;

    private ScheduledExecutorService senderRetry;

    public WechatMonitorService(WechatMonitorState monitorState,
                                WechatExtractService extractService,
                                WechatEventMapper eventMapper,
                                WechatTrackingService trackingService) {
        this.monitorState = monitorState;
        this.extractService = extractService;
        this.eventMapper = eventMapper;
        this.trackingService = trackingService;
    }

    // ==================================================================
    // 启动初始化
    // ==================================================================

    /** 等价 initEventsFromDb()：启动期无租户上下文，mapper 抛未授权异常 → 静默，events 保持空。 */
    @PostConstruct
    public void init() {
        try {
            if (monitorState.events.isEmpty()) {
                List<Map<String, Object>> loaded = extractService.loadEventsFromDb();
                for (Map<String, Object> e : loaded) {
                    monitorState.events.add(e);
                }
            }
        } catch (Exception ignored) {
            // 等价 Node 的失败路径：events 保持空
        }
        startSenderRetryJob();
        if ("true".equals(System.getenv("ENABLE_LOCAL_FEATURES"))
                && !"false".equals(System.getenv("BACKGROUND_JOBS_ENABLED"))) {
            Thread syncThread = new Thread(trackingService::syncExistingTracking, "wechat-sync-tracking");
            syncThread.setDaemon(true);
            syncThread.start();
        }
    }

    private synchronized void startSenderRetryJob() {
        if (senderRetry != null) {
            return;
        }
        senderRetry = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "wechat-sender-retry");
            t.setDaemon(true);
            return t;
        });
        // 立即执行一次 + 每 15 秒重试
        senderRetry.schedule(this::runSenderRetry, 0, TimeUnit.MILLISECONDS);
        senderRetry.scheduleAtFixedRate(this::runSenderRetry, 15, 15, TimeUnit.SECONDS);
    }

    /** 等价 runSenderRetry()。 */
    public void runSenderRetry() {
        try {
            List<Map<String, Object>> rows = eventMapper.listUnidentifiedSenders();
            if (rows.isEmpty()) {
                return;
            }
            int updated = 0;
            for (Map<String, Object> r : rows) {
                String newSender = "";
                String cleanChatName = extractService.cleanSender(WechatExtractService.str(r.get("chat_name")));
                if (!cleanChatName.isEmpty() && !WechatExtractService.looksLikeGroupName(cleanChatName)) {
                    newSender = cleanChatName;
                }
                if (newSender.isEmpty() && !WechatExtractService.str(r.get("message_text")).isEmpty()) {
                    try {
                        Map<String, Object> re = extractService.extractWithJavascript(
                                WechatExtractService.str(r.get("message_text")), "");
                        if (!WechatExtractService.str(re.get("sender")).isEmpty()) {
                            newSender = extractService.cleanSender(WechatExtractService.str(re.get("sender")));
                        }
                    } catch (Exception ignored) {
                        // 忽略
                    }
                }
                if (newSender.isEmpty() && !cleanChatName.isEmpty()) {
                    newSender = cleanChatName;
                }
                if (newSender.isEmpty()) {
                    continue;
                }
                String canonical = extractService.resolveCanonicalInvestorName(newSender);
                if (canonical.isEmpty()) {
                    continue;
                }
                String id = WechatExtractService.str(r.get("id"));
                eventMapper.updateSenderIfUnidentified(canonical, id);
                updated++;
                if ("stock_pick".equals(WechatExtractService.str(r.get("category")))
                        && !WechatExtractService.str(r.get("stocks_json")).isEmpty()) {
                    try {
                        List<Map<String, Object>> stocks = extractService.parseJsonList(
                                WechatExtractService.str(r.get("stocks_json")));
                        List<Map<String, Object>> validStocks = new ArrayList<>();
                        for (Map<String, Object> s : stocks) {
                            if (s != null && s.get("code") != null
                                    && WechatExtractService.str(s.get("code")).trim().matches("\\d{6}")) {
                                validStocks.add(s);
                            }
                        }
                        if (!validStocks.isEmpty()) {
                            String pickDate = WechatExtractService.normalizeDateStr(
                                    WechatExtractService.firstNonBlankStr(r.get("captured_at"), r.get("message_time"),
                                            r.get("created_at")));
                            long now = System.currentTimeMillis();
                            for (Map<String, Object> s : validStocks) {
                                Map<String, Object> tk = new LinkedHashMap<>();
                                tk.put("id", id + "_" + s.get("code"));
                                tk.put("eventId", id);
                                tk.put("chatName", cleanChatName);
                                tk.put("sender", canonical);
                                tk.put("stockCode", s.get("code"));
                                tk.put("stockName", s.getOrDefault("name", ""));
                                tk.put("pickDate", pickDate);
                                tk.put("pickMessage", WechatExtractService.str(r.get("message_text")));
                                tk.put("createdAt", now);
                                tk.put("updatedAt", now);
                                extractService.insertTrackingIgnore(tk);
                            }
                        }
                    } catch (Exception ignored) {
                        // 忽略
                    }
                }
                extractService.updateWechatEventCategoryInMemory(id, null, canonical);
            }
            if (updated > 0) {
                // 与 Node console.log 等价（静默即可）
            }
        } catch (Exception err) {
            // 重试识别失败
        }
    }

    // ==================================================================
    // 监听进程
    // ==================================================================

    public synchronized Map<String, Object> startWechatMonitor() {
        if (monitorState.process != null && monitorState.process.isAlive()) {
            return getWechatMonitorStatus();
        }
        String[] tools = extractService.ensureJavaCompiled();
        monitorState.stopping = false;
        monitorState.running = true;
        monitorState.state = "STARTING";
        monitorState.lastError = "";
        monitorState.startedAt = java.time.Instant.now().toString();

        List<String> cmd = List.of(tools[0], "-cp", extractService.javaBuildDir().getAbsolutePath(),
                "WechatWindowMonitor", extractService.windowReaderScript().getAbsolutePath());
        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.directory(extractService.projectRoot());
        Process child;
        try {
            child = pb.start();
        } catch (Exception e) {
            monitorState.lastError = e.getMessage() == null ? String.valueOf(e) : e.getMessage();
            monitorState.state = "ERROR";
            monitorState.running = false;
            throw new RuntimeException(e.getMessage());
        }
        monitorState.process = child;

        // 监听输出解析依赖数据库写入，需要沿用启动监听时的用户上下文（Node 的 AsyncLocalStorage 语义）。
        UserContext.CurrentUser monitorUser = UserContext.current();
        Thread outThread = new Thread(() -> {
            UserContext.set(monitorUser);
            try (BufferedReader br = new BufferedReader(
                    new InputStreamReader(child.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = br.readLine()) != null) {
                    handleMonitorLine(line);
                }
            } catch (Exception ignored) {
                // 读取结束
            } finally {
                UserContext.clear();
            }
        }, "wechat-monitor-stdout");
        outThread.setDaemon(true);
        outThread.start();

        Thread errThread = new Thread(() -> {
            try (BufferedReader br = new BufferedReader(
                    new InputStreamReader(child.getErrorStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = br.readLine()) != null) {
                    String message = line.trim();
                    if (!message.isEmpty()) {
                        monitorState.lastError = message;
                    }
                }
            } catch (Exception ignored) {
                // 读取结束
            }
        }, "wechat-monitor-stderr");
        errThread.setDaemon(true);
        errThread.start();

        Thread exitThread = new Thread(() -> {
            int code;
            try {
                code = child.waitFor();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
            if (monitorState.process != child) {
                return;
            }
            monitorState.process = null;
            monitorState.running = false;
            if (!"STOPPED".equals(monitorState.state)) {
                monitorState.state = code == 0 ? "STOPPED" : "ERROR";
                if (code != 0 && (monitorState.lastError == null || monitorState.lastError.isEmpty())) {
                    monitorState.lastError = "Java 监听进程退出，代码 " + code;
                }
            }
        }, "wechat-monitor-exit");
        exitThread.setDaemon(true);
        exitThread.start();

        return getWechatMonitorStatus();
    }

    public synchronized Map<String, Object> stopWechatMonitor() {
        Process child = monitorState.process;
        monitorState.stopping = true;
        if (child != null && child.isAlive()) {
            long pid = child.pid();
            extractService.runProcess(List.of("taskkill", "/PID", String.valueOf(pid), "/T", "/F"), null, 5000);
        }
        monitorState.process = null;
        monitorState.running = false;
        monitorState.state = "STOPPED";
        monitorState.chatName = "";
        return getWechatMonitorStatus();
    }

    public Map<String, Object> getWechatMonitorStatus() {
        LinkedHashMap<String, Object> out = new LinkedHashMap<>();
        out.put("running", monitorState.running);
        out.put("state", monitorState.state);
        out.put("chatName", monitorState.chatName);
        out.put("lastError", monitorState.lastError);
        out.put("startedAt", monitorState.startedAt);
        out.put("javaAvailable", extractService.javaAvailable());
        out.put("events", new ArrayList<>(monitorState.events));
        return out;
    }

    /** 等价 handleMonitorLine(line)。 */
    public void handleMonitorLine(String line) {
        if (monitorState.stopping) {
            return;
        }
        String value = line == null ? "" : line.trim();
        if (!value.startsWith("{")) {
            return;
        }
        try {
            Map<String, Object> event = extractService.parseJsonMap(value);
            String type = WechatExtractService.str(event.get("type"));
            if ("ready".equals(type)) {
                monitorState.state = "READY";
                monitorState.lastError = "";
            } else if ("state".equals(type)) {
                monitorState.state = WechatExtractService.firstNonBlankStr(event.get("state"), "WATCHING");
                monitorState.chatName = WechatExtractService.str(event.get("chatName"));
            } else if ("error".equals(type)) {
                monitorState.state = "ERROR";
                monitorState.lastError = WechatExtractService.firstNonBlankStr(event.get("message"), "微信窗口读取失败");
            } else if ("stock-message".equals(type)) {
                monitorState.state = "WATCHING";
                monitorState.chatName = WechatExtractService.firstNonBlankStr(event.get("chatName"), monitorState.chatName);
                pushMonitorEvent(event);
            }
        } catch (Exception error) {
            monitorState.lastError = "监听输出解析失败：" + error.getMessage();
        }
    }

    /** 等价 pushMonitorEvent(event)。 */
    public void pushMonitorEvent(Map<String, Object> event) {
        try {
            String recommendationDate = WechatExtractService.sanitizeRecommendationDate(
                    WechatExtractService.str(event.get("recommendationDate")),
                    WechatExtractService.str(event.get("capturedAt")));
            String cleanEventSender = extractService.cleanSender(WechatExtractService.str(event.get("sender")));
            String cleanChatName = extractService.cleanSender(WechatExtractService.str(event.get("chatName")));
            String canonicalSender = extractService.resolveCanonicalInvestorName(cleanEventSender);

            LinkedHashMap<String, Object> cleanedEvent = new LinkedHashMap<>(event);
            cleanedEvent.put("sender", canonicalSender);
            cleanedEvent.put("chatName", cleanChatName);
            cleanedEvent.put("recommendationDate", recommendationDate);

            String text = WechatExtractService.firstNonBlankStr(cleanedEvent.get("usefulMessage"),
                    cleanedEvent.get("originalMessage"), "");
            boolean hit = extractService.isBlacklisted(cleanEventSender, cleanChatName, text);
            if (hit) {
                return;
            }

            String id = System.currentTimeMillis() + "-" + WechatExtractService.randomBase36(6);
            LinkedHashMap<String, Object> fullEvent = new LinkedHashMap<>(cleanedEvent);
            fullEvent.put("id", id);
            String finalCategory = extractService.saveEventInternal(fullEvent);
            fullEvent.put("category", finalCategory.isEmpty() ? "market_news" : finalCategory);
            monitorState.unshift(fullEvent);
        } catch (Exception err) {
            // 推送消息异常
        }
    }
}
