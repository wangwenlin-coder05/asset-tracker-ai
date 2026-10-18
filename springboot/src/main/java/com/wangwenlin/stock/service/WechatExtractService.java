package com.wangwenlin.stock.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wangwenlin.stock.mapper.WechatEventMapper;
import com.wangwenlin.stock.mapper.WechatFeedbackMapper;
import com.wangwenlin.stock.mapper.WechatTrackingMapper;
import org.springframework.stereotype.Service;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.text.Normalizer;

/**
 * wechat-extractor.js 的 Java 移植：发送人清洗/归并、黑名单、日期识别、
 * JS 兜底抽取、事件入库/加载/删除/清空，以及外部 Java 工具的编译与调用。
 */
@Service
public class WechatExtractService {

    private static final ObjectMapper OM = new ObjectMapper();

    private final WechatEventMapper eventMapper;
    private final WechatTrackingMapper trackingMapper;
    private final WechatFeedbackMapper feedbackMapper;
    private final WechatMonitorState monitorState;

    @org.springframework.beans.factory.annotation.Autowired
    private WechatCategoryService categoryService;

    public WechatExtractService(WechatEventMapper eventMapper,
                                WechatTrackingMapper trackingMapper,
                                WechatFeedbackMapper feedbackMapper,
                                WechatMonitorState monitorState) {
        this.eventMapper = eventMapper;
        this.trackingMapper = trackingMapper;
        this.feedbackMapper = feedbackMapper;
        this.monitorState = monitorState;
    }

    // ==================================================================
    // 工程根目录 / 外部 Java 工具
    // ==================================================================

    /** Node 用 __dirname（工程根）。Spring cwd 可能是 springboot，这里显式解析到工程根。 */
    public File projectRoot() {
        File dir = new File(System.getProperty("user.dir", ".")).getAbsoluteFile();
        for (int i = 0; i < 4 && dir != null; i++) {
            if (new File(dir, "wechat-extractor.js").exists()
                    || new File(dir, "java/WechatStockExtractor.java").exists()) {
                return dir;
            }
            dir = dir.getParentFile();
        }
        return new File(System.getProperty("user.dir", ".")).getAbsoluteFile();
    }

    public File javaSource() {
        return new File(projectRoot(), "java/WechatStockExtractor.java");
    }

    public File monitorSource() {
        return new File(projectRoot(), "java/WechatWindowMonitor.java");
    }

    public File javaBuildDir() {
        return new File(projectRoot(), ".launcher/java");
    }

    public File windowReaderScript() {
        return new File(projectRoot(), "wechat_monitor.py");
    }

    /** 等价 findJavaTools()：JAVA_HOME、~/.jdks/ms-21.0.11，其次 PATH 上的 java/javac。 */
    public String[] findJavaTools() {
        List<String> homes = new ArrayList<>();
        String javaHome = System.getenv("JAVA_HOME");
        if (javaHome != null && !javaHome.isEmpty()) {
            homes.add(javaHome);
        }
        String userProfile = System.getenv("USERPROFILE");
        if (userProfile != null && !userProfile.isEmpty()) {
            homes.add(Paths.get(userProfile, ".jdks", "ms-21.0.11").toString());
        }
        for (String home : homes) {
            File java = new File(home, "bin/java.exe");
            File javac = new File(home, "bin/javac.exe");
            if (java.exists() && javac.exists()) {
                return new String[]{java.getAbsolutePath(), javac.getAbsolutePath()};
            }
        }
        ProcessResult jc = runProcess(List.of("java", "-version"), null, 3000);
        ProcessResult vc = runProcess(List.of("javac", "-version"), null, 3000);
        if (jc.error == null && jc.status == 0 && vc.error == null && vc.status == 0) {
            return new String[]{"java", "javac"};
        }
        return null;
    }

    public boolean javaAvailable() {
        return findJavaTools() != null;
    }

    /** 等价 ensureJavaCompiled()：源码比 class 新则重新编译。返回 {java, javac}。 */
    public String[] ensureJavaCompiled() {
        String[] tools = findJavaTools();
        if (tools == null) {
            throw new RuntimeException("未找到 JDK，请安装 Java 17 或更高版本");
        }
        File buildDir = javaBuildDir();
        if (!buildDir.exists()) {
            buildDir.mkdirs();
        }
        long newestSourceTime = Math.max(javaSource().lastModified(), monitorSource().lastModified());
        File javaClass = new File(buildDir, "WechatStockExtractor.class");
        File monitorClass = new File(buildDir, "WechatWindowMonitor.class");
        long oldestClassTime = Math.min(javaClass.exists() ? javaClass.lastModified() : 0,
                monitorClass.exists() ? monitorClass.lastModified() : 0);
        if (oldestClassTime >= newestSourceTime) {
            return tools;
        }
        ProcessResult compiled = runProcess(List.of(tools[1], "-encoding", "UTF-8", "-d", buildDir.getAbsolutePath(),
                javaSource().getAbsolutePath(), monitorSource().getAbsolutePath()), null, 20000);
        if (compiled.error != null || compiled.status != 0) {
            String msg = firstNonBlank(compiled.stderr, compiled.stdout,
                    compiled.error == null ? null : compiled.error.getMessage(), "Java 编译失败");
            throw new RuntimeException(msg.trim());
        }
        return tools;
    }

    public static final class ProcessResult {
        public final int status;
        public final String stdout;
        public final String stderr;
        public final Exception error;

        ProcessResult(int status, String stdout, String stderr, Exception error) {
            this.status = status;
            this.stdout = stdout;
            this.stderr = stderr;
            this.error = error;
        }
    }

    /** 等价 spawnSync：写 stdin，读取 stdout/stderr，超时则强杀。 */
    public ProcessResult runProcess(List<String> cmd, String input, long timeoutMs) {
        Process process = null;
        try {
            ProcessBuilder pb = new ProcessBuilder(cmd);
            pb.redirectErrorStream(false);
            process = pb.start();
            if (input != null) {
                process.getOutputStream().write(input.getBytes(StandardCharsets.UTF_8));
            }
            process.getOutputStream().close();
            byte[] out = process.getInputStream().readAllBytes();
            byte[] err = process.getErrorStream().readAllBytes();
            boolean finished = process.waitFor(timeoutMs, TimeUnit.MILLISECONDS);
            if (!finished) {
                process.destroyForcibly();
                return new ProcessResult(-1, new String(out, StandardCharsets.UTF_8),
                        new String(err, StandardCharsets.UTF_8), new RuntimeException("ETIMEDOUT"));
            }
            return new ProcessResult(process.exitValue(), new String(out, StandardCharsets.UTF_8),
                    new String(err, StandardCharsets.UTF_8), null);
        } catch (Exception e) {
            if (process != null) {
                process.destroyForcibly();
            }
            return new ProcessResult(-1, "", "", e);
        }
    }

    private static String firstNonBlank(String... values) {
        for (String v : values) {
            if (v != null && !v.trim().isEmpty()) {
                return v;
            }
        }
        return "";
    }

    // ==================================================================
    // 发送人清洗 / 归并
    // ==================================================================

    private static final Set<String> INVALID_SENDERS = Set.of(
            "", "微信", "微信电脑版", "WeChat", "wechat", "聊天", "消息",
            "文件传输助手", "文件助手", "系统消息", "系统", "通知", "服务通知",
            "订阅号消息", "服务号", "公众号", "新闻", "腾讯新闻",
            "全部会话", "会话", "联系人", "通讯录", "朋友圈",
            "发现", "我", "收藏", "表情", "视频号",
            "看盘", "消息列表", "消息管理器");

    private static final Pattern SENDER_TIME_SUFFIX = Pattern.compile("\\s*(?:星期[一二三四五六日天])?\\s*\\d{1,2}:\\d{2}\\s*$");
    private static final Pattern SENDER_DATE_SUFFIX = Pattern.compile("\\s*\\d{1,2}月\\d{1,2}日(?:星期[一二三四五六日天])?\\s*$");
    private static final Pattern INVESTOR_KEY_STRIP = Pattern.compile("[\\s·•・._\\-—–~～,，。:：;；'\"“”‘’()（）\\[\\]【】{}]+");

    public String cleanSender(String value) {
        String s = value == null ? "" : value;
        s = s.trim().replaceFirst("^[【\\[]", "").replaceFirst("[】\\]]$", "").trim();
        s = SENDER_TIME_SUFFIX.matcher(s).replaceAll("").trim();
        s = SENDER_DATE_SUFFIX.matcher(s).replaceAll("").trim();
        if (INVALID_SENDERS.contains(s)) {
            return "";
        }
        if (s.length() > 20) {
            s = s.substring(0, 20);
        }
        return s;
    }

    public String normalizeInvestorKey(String value) {
        String s = Normalizer.normalize(cleanSender(value), Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
        return INVESTOR_KEY_STRIP.matcher(s).replaceAll("");
    }

    private volatile List<Map<String, Object>> investorNameCache = new ArrayList<>();
    private volatile long investorNameCacheTime = 0;
    private static final long INVESTOR_NAME_CACHE_TTL = 30000;

    public String resolveCanonicalInvestorName(String value) {
        String cleaned = cleanSender(value);
        if (cleaned.isEmpty()) {
            return "";
        }
        String key = normalizeInvestorKey(cleaned);
        if (key.isEmpty()) {
            return cleaned;
        }
        long now = System.currentTimeMillis();
        if (now - investorNameCacheTime > INVESTOR_NAME_CACHE_TTL) {
            investorNameCache = new ArrayList<>();
            investorNameCacheTime = now;
        }
        synchronized (this) {
            for (Map<String, Object> item : investorNameCache) {
                if (key.equals(item.get("key"))) {
                    return String.valueOf(item.get("name"));
                }
            }
        }
        try {
            List<Map<String, Object>> rows = eventMapper.listCanonicalSenderNames();
            for (Map<String, Object> row : rows) {
                String existing = cleanSender(str(row.get("sender")));
                if (!existing.isEmpty() && normalizeInvestorKey(existing).equals(key)) {
                    cacheInvestorName(key, existing);
                    return existing;
                }
            }
        } catch (Exception err) {
            // 归并失败时退回原名（等价 Node catch 分支）
        }
        cacheInvestorName(key, cleaned);
        return cleaned;
    }

    private synchronized void cacheInvestorName(String key, String name) {
        List<Map<String, Object>> copy = new ArrayList<>(investorNameCache);
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("key", key);
        item.put("name", name);
        copy.add(item);
        investorNameCache = copy;
    }

    // ==================================================================
    // 黑名单
    // ==================================================================

    private volatile List<Map<String, Object>> blacklistCache = new ArrayList<>();
    private volatile long blacklistCacheTime = 0;
    private static final long BLACKLIST_CACHE_TTL = 60000;

    public boolean isBlacklisted(String sender, String chatName, String text) {
        try {
            long now = System.currentTimeMillis();
            if (now - blacklistCacheTime > BLACKLIST_CACHE_TTL || blacklistCache.isEmpty()) {
                blacklistCache = eventMapper.listEnabledBlacklist();
                blacklistCacheTime = now;
            }
            for (Map<String, Object> item : blacklistCache) {
                String v = str(item.get("value")).trim();
                if (v.isEmpty()) {
                    continue;
                }
                String type = str(item.get("type"));
                if ("sender".equals(type) && sender != null && !sender.isEmpty() && sender.trim().equals(v)) {
                    return true;
                }
                if ("chat_name".equals(type) && chatName != null && !chatName.isEmpty() && chatName.trim().equals(v)) {
                    return true;
                }
                if ("keyword".equals(type) && text != null && !text.isEmpty() && text.contains(v)) {
                    return true;
                }
            }
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    public void clearBlacklistCache() {
        blacklistCache = new ArrayList<>();
        blacklistCacheTime = 0;
    }

    // ==================================================================
    // 日期工具
    // ==================================================================

    private static final DateTimeFormatter YMD = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private static String pad2(int n) {
        return n < 10 ? "0" + n : String.valueOf(n);
    }

    private static LocalDate parseJsDate(String iso) {
        if (iso == null || iso.isEmpty()) {
            return null;
        }
        String s = iso.trim();
        try {
            if (s.endsWith("Z") || s.contains("T")) {
                ZonedDateTime z = ZonedDateTime.parse(s.replace(" ", "T").replaceAll("\\.\\d+", "").replace("Z", "Z")
                        .replace("ZZ", "Z"), DateTimeFormatter.ISO_ZONED_DATE_TIME);
                return z.withZoneSameInstant(ZoneId.systemDefault()).toLocalDate();
            }
            if (s.matches("\\d{4}-\\d{2}-\\d{2}[ T]\\d{2}:\\d{2}:\\d{2}")) {
                return LocalDateTime.parse(s.replace(" ", "T")).toLocalDate();
            }
            if (s.matches("\\d{4}-\\d{2}-\\d{2}")) {
                return LocalDate.parse(s);
            }
            if (s.matches("\\d+")) {
                return LocalDateTime.ofInstant(java.time.Instant.ofEpochMilli(Long.parseLong(s)),
                        ZoneId.systemDefault()).toLocalDate();
            }
        } catch (Exception ignored) {
            return null;
        }
        return null;
    }

    public static String safeDateFromIso(String iso) {
        LocalDate d = parseJsDate(iso);
        return d == null ? "" : d.format(YMD);
    }

    private static String safeDate(int year, int month, int day) {
        try {
            LocalDate d = LocalDate.of(year, month, day);
            return year + "-" + pad2(month) + "-" + pad2(day);
        } catch (Exception e) {
            return "";
        }
    }

    private static long localMidnight(String ymd) {
        LocalDate d = LocalDate.parse(ymd, YMD);
        return d.atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli();
    }

    private static boolean isDateTooOld(String dateStr, long nowMs, int maxDays) {
        long candidate = localMidnight(dateStr);
        return Math.abs(nowMs - candidate) > (long) maxDays * 24 * 60 * 60 * 1000;
    }

    private static boolean datesClose(String a, String b) {
        return Math.abs(localMidnight(a) - localMidnight(b)) <= 24L * 60 * 60 * 1000;
    }

    private static final Pattern CN_DATE = Pattern.compile("(?:(20\\d{2})年)?(\\d{1,2})月(\\d{1,2})日");
    private static final Pattern DOT_DATE = Pattern.compile("(?:^|\\D)(\\d{1,2})[./-](\\d{1,2})(?!\\d)");

    /** detectDate：等价 wechat-extractor.js detectDate(text, capturedAt)。 */
    public static String detectDate(String text, String capturedAt) {
        String src = str(text);
        String head = src.length() > 100 ? src.substring(0, 100) : src;
        LocalDate now = LocalDate.now();
        int year = now.getYear();

        Matcher cnHead = CN_DATE.matcher(head);
        if (cnHead.find()) {
            int y = cnHead.group(1) != null ? Integer.parseInt(cnHead.group(1)) : year;
            String candidate = safeDate(y, Integer.parseInt(cnHead.group(2)), Integer.parseInt(cnHead.group(3)));
            if (!candidate.isEmpty() && !isDateTooOld(candidate, System.currentTimeMillis(), 14)) {
                return candidate;
            }
        }
        Matcher dotHead = DOT_DATE.matcher(head);
        if (dotHead.find()) {
            String candidate = safeDate(year, Integer.parseInt(dotHead.group(1)), Integer.parseInt(dotHead.group(2)));
            if (!candidate.isEmpty() && !isDateTooOld(candidate, System.currentTimeMillis(), 14)) {
                return candidate;
            }
        }
        if (capturedAt != null && !capturedAt.isEmpty()) {
            String capDate = safeDateFromIso(capturedAt);
            if (!capDate.isEmpty()) {
                Matcher cnAll = CN_DATE.matcher(src);
                if (cnAll.find()) {
                    int y = cnAll.group(1) != null ? Integer.parseInt(cnAll.group(1)) : year;
                    String candidate = safeDate(y, Integer.parseInt(cnAll.group(2)), Integer.parseInt(cnAll.group(3)));
                    if (!candidate.isEmpty() && datesClose(candidate, capDate)) {
                        return candidate;
                    }
                }
            }
        }
        return "";
    }

    public static String sanitizeRecommendationDate(String recommendationDate, String capturedAt) {
        if (recommendationDate == null || recommendationDate.isEmpty()) {
            return "";
        }
        if (capturedAt == null || capturedAt.isEmpty()) {
            return recommendationDate;
        }
        String capDate = safeDateFromIso(capturedAt);
        if (capDate.isEmpty()) {
            return recommendationDate;
        }
        if (isDateTooOld(recommendationDate, localMidnight(capDate), 2)) {
            return "";
        }
        return recommendationDate;
    }

    /** normalizeDateStr：ISO/毫秒/YYYY-M-D → YYYY-MM-DD；失败返回 ''。 */
    public static String normalizeDateStr(Object input) {
        if (input == null) {
            return "";
        }
        if (input instanceof Number) {
            LocalDate d = LocalDateTime.ofInstant(java.time.Instant.ofEpochMilli(((Number) input).longValue()),
                    ZoneId.systemDefault()).toLocalDate();
            return d.format(YMD);
        }
        String s = String.valueOf(input).trim();
        Matcher m = Pattern.compile("(\\d{4})[-./](\\d{1,2})[-./](\\d{1,2})").matcher(s);
        if (m.find()) {
            return m.group(1) + "-" + pad2(Integer.parseInt(m.group(2))) + "-" + pad2(Integer.parseInt(m.group(3)));
        }
        if (s.matches("\\d+")) {
            LocalDate d = LocalDateTime.ofInstant(java.time.Instant.ofEpochMilli(Long.parseLong(s)),
                    ZoneId.systemDefault()).toLocalDate();
            return d.format(YMD);
        }
        Matcher iso = Pattern.compile("(\\d{4})-(\\d{2})-(\\d{2})").matcher(s);
        if (iso.find()) {
            return iso.group(1) + "-" + iso.group(2) + "-" + iso.group(3);
        }
        return "";
    }

    /** new Date(created_at).toISOString().split('T')[0]：UTC 日期。 */
    public static String isoDateUtc(Object createdAt) {
        if (createdAt == null) {
            return "";
        }
        long epoch;
        if (createdAt instanceof Number) {
            epoch = ((Number) createdAt).longValue();
        } else {
            LocalDate d = parseJsDate(String.valueOf(createdAt));
            if (d == null) {
                LocalDateTime dt = tryParseLocalDateTime(String.valueOf(createdAt));
                if (dt == null) {
                    return "";
                }
                epoch = dt.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
            } else {
                epoch = d.atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli();
            }
        }
        return java.time.Instant.ofEpochMilli(epoch).atZone(ZoneId.of("UTC")).toLocalDate().format(YMD);
    }

    private static LocalDateTime tryParseLocalDateTime(String s) {
        try {
            if (s.matches("\\d{4}-\\d{2}-\\d{2}[ T]\\d{2}:\\d{2}:\\d{2}")) {
                return LocalDateTime.parse(s.replace(" ", "T"));
            }
        } catch (Exception ignored) {
            return null;
        }
        return null;
    }

    // ==================================================================
    // JS 兜底抽取 / 记忆命中
    // ==================================================================

    private static final List<String> NON_STOCK_NAMES = List.of(
            "风险提示", "风险提示：", "风险提示:",
            "免责声明", "免责声明：",
            "投资建议", "投资建议：",
            "仅供参考", "仅供参考。",
            "不构成", "不构成投资建议",
            "市场有风险", "投资有风险",
            "入市须谨慎",
            "点击", "点击查看",
            "打开", "打开链接",
            "复制", "复制链接",
            "链接", "网址",
            "详情", "详情请",
            "完整版",
            "早盘观察池",
            "观察池",
            "推送",
            "每日", "今日",
            "早盘", "尾盘",
            "盘后", "盘中");

    private static final Pattern URL_RE = Pattern.compile("https?://[\\w\\-._~:/?#\\[\\]@!$&'()*+,;=%]+");

    public static boolean isNonStockName(String name) {
        if (name == null || name.isEmpty()) {
            return true;
        }
        String trimmed = name.trim();
        for (String nonStock : NON_STOCK_NAMES) {
            if (trimmed.equals(nonStock) || trimmed.startsWith(nonStock)) {
                return true;
            }
        }
        return false;
    }

    private static boolean codeIsPartOfLongerNumber(String line, int codeStart, String code) {
        int codeEnd = codeStart + code.length();
        if (codeEnd < line.length() && Character.isDigit(line.charAt(codeEnd))) {
            return true;
        }
        if (codeStart > 0 && Character.isLetter(line.charAt(codeStart - 1))) {
            return true;
        }
        if (codeStart > 0 && Character.isDigit(line.charAt(codeStart - 1))) {
            int start = codeStart - 1;
            while (start >= 0 && Character.isDigit(line.charAt(start))) {
                start--;
            }
            int totalLen = codeEnd - start - 1;
            if (totalLen > 6) {
                return true;
            }
        }
        return false;
    }

    public static List<String> extractUrls(String text) {
        List<String> urls = new ArrayList<>();
        Matcher m = URL_RE.matcher(text == null ? "" : text);
        while (m.find()) {
            String url = m.group();
            while (url.endsWith("。") || url.endsWith(".") || url.endsWith(",")) {
                url = url.substring(0, url.length() - 1);
            }
            if (!urls.contains(url)) {
                urls.add(url);
            }
        }
        return urls;
    }

    public Map<String, Object> findMemoryHit(String text, Object memory) {
        if (text == null || text.isEmpty() || memory == null) {
            return null;
        }
        List<?> list = memory instanceof List ? (List<?>) memory : List.of(memory);
        for (Object rec : list) {
            if (!(rec instanceof Map)) {
                continue;
            }
            Map<?, ?> m = (Map<?, ?>) rec;
            Object sourceText = m.get("source_text");
            if (sourceText == null) {
                continue;
            }
            if (text.contains(String.valueOf(sourceText))) {
                return castMap(m);
            }
        }
        return null;
    }

    private static final Pattern P1 = Pattern.compile("【\\s*([^】]*?)\\s+(\\d{6})\\s*】");
    private static final Pattern P2 = Pattern.compile("【\\s*([^】]{2,15})\\s*】\\s*(?:[^\\d]*?)(\\d{6})");
    private static final Pattern P3 = Pattern.compile("([\\u4e00-\\u9fa5A-Za-z]{2,10})\\s+(\\d{6})(?!\\d)");
    private static final Pattern LOGIC_RE = Pattern.compile("[（(]\\s*([^）)]+?)\\s*[）)]");

    private static String extractLogic(String line, String code) {
        int idx = line.indexOf(code);
        if (idx < 0) {
            return "";
        }
        String after = line.substring(idx + code.length());
        Matcher m = LOGIC_RE.matcher(after);
        return m.find() ? m.group(1).trim() : "";
    }

    private static String cleanStockName(String raw) {
        return raw.replaceAll("\\s+", "").replaceFirst("^[⭕🔥\\[\\]红包]+", "");
    }

    private static void addStock(List<Map<String, Object>> stocks, String name, String code, String logic) {
        int existingIndex = -1;
        for (int i = 0; i < stocks.size(); i++) {
            if (String.valueOf(stocks.get(i).get("code")).equals(code)) {
                existingIndex = i;
                break;
            }
        }
        if (existingIndex == -1) {
            LinkedHashMap<String, Object> stock = new LinkedHashMap<>();
            stock.put("name", name);
            stock.put("code", code);
            stock.put("logic", logic);
            stocks.add(stock);
        } else if (!logic.isEmpty() && String.valueOf(stocks.get(existingIndex).get("logic")).isEmpty()) {
            stocks.get(existingIndex).put("logic", logic);
        }
    }

    private static final Pattern LABELLED = Pattern.compile("^(?:发送人|联系人|群聊)\\s*[:：]\\s*(.+)$");
    private static final Pattern DATETIME_SENDER = Pattern.compile("^(.{2,30}?)\\s+\\d{1,2}月\\d{1,2}日\\s+(?:星期[一二三四五六日天])?\\s*\\d{1,2}:\\d{2}\\s*[:：]?$");
    private static final Pattern TIMED_SENDER = Pattern.compile("^(.{1,40}?)\\s+(?:上午|下午)?\\s*\\d{1,2}:\\d{2}$");
    private static final Pattern INLINE_SENDER = Pattern.compile("^([^【】\\[\\]：:]{1,30})[:：]\\s*(.+)$");
    private static final Pattern FROM_SENDER = Pattern.compile("^来自[-—–\\s]*([^-—–\\s]{2,10})");
    private static final Pattern SAY_SENDER = Pattern.compile("^([^【】\\[\\]：:]{2,10})\\s*说\\s*[:：]");
    private static final Pattern SENDER_COLON = Pattern.compile("^发送人\\s*[:：]\\s*(.+)$");
    private static final Pattern DASH_SUFFIX = Pattern.compile("[-—–]\\s*(.+)$");
    private static final Pattern HAS_SIX = Pattern.compile("\\d{6}");
    private static final Pattern TIME_PREFIX = Pattern.compile("^\\d{1,2}[:：]\\d{2}");
    private static final Pattern HTTP_START = Pattern.compile("^https?:", Pattern.CASE_INSENSITIVE);

    /** 等价 wechat-extractor.js extractWithJavascript(rawText, senderHint)。 */
    public Map<String, Object> extractWithJavascript(String rawText, String senderHint) {
        String normalized = str(rawText).replaceAll("\\r\\n?", "\n").trim();
        String sender = cleanSender(senderHint);
        List<Map<String, Object>> stocks = new ArrayList<>();
        List<String> urls = extractUrls(normalized);
        List<String> usefulLines = new ArrayList<>();
        int nonEmptyLineCount = 0;

        for (String originalLine : normalized.split("\n", -1)) {
            String line = originalLine.trim();
            if (line.isEmpty()) {
                continue;
            }
            nonEmptyLineCount++;

            if (sender.isEmpty()) {
                Matcher labelled = LABELLED.matcher(line);
                Matcher dateTimeSender = DATETIME_SENDER.matcher(line);
                Matcher timed = TIMED_SENDER.matcher(line);
                Matcher inline = HTTP_START.matcher(line).find() ? null : INLINE_SENDER.matcher(line);
                Matcher fromPattern = FROM_SENDER.matcher(line);
                Matcher sayPattern = SAY_SENDER.matcher(line);
                Matcher senderColon = SENDER_COLON.matcher(line);

                if (labelled.find()) {
                    sender = cleanSender(labelled.group(1));
                    continue;
                }
                if (senderColon.find()) {
                    sender = cleanSender(senderColon.group(1));
                    continue;
                }
                if (dateTimeSender.find() && !HAS_SIX.matcher(line).find()) {
                    String raw = dateTimeSender.group(1).trim();
                    Matcher dash = DASH_SUFFIX.matcher(raw);
                    sender = cleanSender(dash.find() ? dash.group(1) : raw);
                    continue;
                }
                if (timed.find() && !HAS_SIX.matcher(line).find()) {
                    sender = cleanSender(timed.group(1));
                    continue;
                }
                if (fromPattern.find() && !HAS_SIX.matcher(line).find()) {
                    sender = cleanSender(fromPattern.group(1));
                    continue;
                }
                if (sayPattern.find() && !HAS_SIX.matcher(line).find()) {
                    sender = cleanSender(sayPattern.group(1));
                    continue;
                }
                if (inline != null && inline.find() && !HAS_SIX.matcher(line).find()) {
                    sender = cleanSender(inline.group(1));
                    line = inline.group(2).trim();
                }
            }

            Matcher m1 = P1.matcher(line);
            while (m1.find()) {
                String name = cleanStockName(m1.group(1));
                if (name.isEmpty() || isNonStockName(name)) {
                    continue;
                }
                addStock(stocks, name, m1.group(2), extractLogic(line, m1.group(2)));
            }
            Matcher m2 = P2.matcher(line);
            while (m2.find()) {
                String name = cleanStockName(m2.group(1));
                if (name.isEmpty() || isNonStockName(name)) {
                    continue;
                }
                addStock(stocks, name, m2.group(2), extractLogic(line, m2.group(2)));
            }
            Matcher m3 = P3.matcher(line);
            while (m3.find()) {
                String name = m3.group(1).replaceAll("\\s+", "");
                int codeStart = m3.start() + m3.group(1).length() + 1;
                if (TIME_PREFIX.matcher(line).find()) {
                    continue;
                }
                if (name.isEmpty() || isNonStockName(name)) {
                    continue;
                }
                if (codeIsPartOfLongerNumber(line, codeStart, m3.group(2))) {
                    continue;
                }
                addStock(stocks, name, m3.group(2), extractLogic(line, m3.group(2)));
            }

            usefulLines.add(cleanUsefulLine(line));
        }

        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        result.put("sender", sender.isEmpty() ? "" : sender);
        result.put("recommendationDate", detectDate(normalized, null));
        result.put("originalMessage", normalized);
        result.put("usefulMessage", String.join("\n", usefulLines));
        result.put("filteredLineCount", Math.max(0, nonEmptyLineCount - usefulLines.size()));
        result.put("stocks", stocks);
        result.put("urls", urls);
        result.put("engine", "javascript-fallback");
        return result;
    }

    private static String cleanUsefulLine(String line) {
        return line.replaceFirst("^[，,、；;\\s]+", "").trim();
    }

    /** 等价 extractWechatStocks(rawText, senderHint, memory)。 */
    public Map<String, Object> extractWechatStocks(String rawText, String senderHint, Object memory) {
        Map<String, Object> result;
        if (!javaAvailable()) {
            result = extractWithJavascript(rawText, senderHint);
        } else {
            try {
                String[] tools = ensureJavaCompiled();
                String senderArg = Base64.getEncoder()
                        .encodeToString(forceStr(senderHint).getBytes(StandardCharsets.UTF_8));
                ProcessResult executed = runProcess(List.of(tools[0], "-cp", javaBuildDir().getAbsolutePath(),
                        "WechatStockExtractor", senderArg), forceStr(rawText), 10000);
                if (executed.error != null || executed.status != 0) {
                    throw new RuntimeException(firstNonBlank(executed.stderr, executed.stdout,
                            executed.error == null ? null : executed.error.getMessage(), "Java 执行失败").trim());
                }
                Map<String, Object> parsed = parseJsonMap(executed.stdout);
                parsed.put("engine", "java");
                result = parsed;
            } catch (Exception error) {
                result = extractWithJavascript(rawText, senderHint);
                result.put("javaError", error.getMessage());
            }
        }
        Map<String, Object> memHit = findMemoryHit(rawText, memory);
        if (memHit != null && memHit.get("correct_code") != null
                && str(memHit.get("correct_code")).trim().matches("\\d{6}")) {
            List<Map<String, Object>> stocks = new ArrayList<>();
            LinkedHashMap<String, Object> stock = new LinkedHashMap<>();
            stock.put("code", memHit.get("correct_code"));
            stock.put("name", "");
            stock.put("logic", "");
            stocks.add(stock);
            result.put("stocks", stocks);
        } else if (memHit != null && memHit.get("correct_label") != null
                && !"stock_pick".equals(str(memHit.get("correct_label")))) {
            result.put("stocks", new ArrayList<>());
        }
        return result;
    }

    public Map<String, Object> extractWechatStocks(String rawText, String senderHint) {
        return extractWechatStocks(rawText, senderHint, null);
    }

    // ==================================================================
    // 事件入库 / 加载 / 删除 / 清空
    // ==================================================================

    /** 等价 /群|交流|讨论|分享|服务|客户$/ 的判断。 */
    static boolean looksLikeGroupName(String s) {
        if (s == null || s.isEmpty()) {
            return false;
        }
        return s.contains("群") || s.contains("交流") || s.contains("讨论")
                || s.contains("分享") || s.contains("服务") || s.endsWith("客户");
    }

    /** 等价 saveEventToDb(cleanEventSender, cleanChatName, ...)。返回 -> 落到 Map 的 category。 */
    public Map<String, Object> saveEventToDb(Map<String, Object> event) {
        String category = saveEventInternal(event);
        Map<String, Object> out = event == null ? new LinkedHashMap<>() : event;
        out.put("category", category);
        return out;
    }

    /** 内部：返回最终 category 字符串（等价 Node saveEventToDb 的返回值）。 */
    public String saveEventInternal(Map<String, Object> event) {
        Map<String, Object> ev = event == null ? new LinkedHashMap<>() : event;
        try {
            String cleanEventSender = cleanSender(str(ev.get("sender")));
            String cleanChatName = cleanSender(str(ev.get("chatName")));

            if (cleanEventSender.isEmpty() && !cleanChatName.isEmpty()) {
                cleanEventSender = cleanSender(cleanChatName);
                if (looksLikeGroupName(cleanEventSender)) {
                    try {
                        String msgText = firstNonBlankStr(ev.get("usefulMessage"), ev.get("originalMessage"), "");
                        Map<String, Object> reextract = extractWithJavascript(msgText, "");
                        if (str(reextract.get("sender")).length() > 0) {
                            cleanEventSender = cleanSender(str(reextract.get("sender")));
                        }
                    } catch (Exception ignored) {
                        // 忽略
                    }
                }
            }

            String text = firstNonBlankStr(ev.get("usefulMessage"), ev.get("originalMessage"), "");
            boolean hit = isBlacklisted(cleanEventSender, cleanChatName, text);
            if (hit) {
                return !str(ev.get("category")).isEmpty() ? str(ev.get("category")) : "market_news";
            }

            String stocksJson = toJson(ev.getOrDefault("stocks", new ArrayList<>()));
            String urlsJson = toJson(ev.getOrDefault("urls", new ArrayList<>()));
            long now = System.currentTimeMillis();
            String id = str(ev.get("id"));
            if (id.isEmpty()) {
                id = now + "-" + randomBase36(6);
            }
            String messageText = firstNonBlankStr(ev.get("usefulMessage"), ev.get("originalMessage"), "");

            String category = categoryService.categorizeMessage(messageText, stocksJson);
            if (category == null || category.isEmpty()
                    || !List.of("stock_pick", "market_news", "marketing").contains(category)) {
                category = "market_news";
            }
            String finalSender = resolveCanonicalInvestorName(cleanEventSender);

            if (!finalSender.isEmpty() && !messageText.isEmpty()) {
                String textPrefix = messageText.trim();
                if (textPrefix.length() > 120) {
                    textPrefix = textPrefix.substring(0, 120);
                }
                String capturedDay = str(ev.get("capturedAt"));
                if (capturedDay.length() > 10) {
                    capturedDay = capturedDay.substring(0, 10);
                }
                try {
                    Map<String, Object> dup = eventMapper.findDuplicate(finalSender, textPrefix, capturedDay + "%");
                    if (dup != null) {
                        return category;
                    }
                } catch (Exception ignored) {
                    // 去重查询失败就继续插入
                }
            }

            Map<String, Object> data = new LinkedHashMap<>();
            data.put("id", id);
            data.put("chatName", cleanChatName);
            data.put("sender", finalSender);
            data.put("messageText", messageText);
            data.put("messageTime", str(ev.getOrDefault("messageTime", "")));
            data.put("capturedAt", str(ev.getOrDefault("capturedAt", "")));
            data.put("stocksJson", stocksJson);
            data.put("createdAt", now);
            data.put("category", category);
            data.put("urlsJson", urlsJson);
            eventMapper.upsertMonitoredEvent(data);

            if ("stock_pick".equals(category) && !finalSender.isEmpty()) {
                try {
                    List<Map<String, Object>> stocks = parseJsonList(stocksJson);
                    List<Map<String, Object>> validStocks = filterValidStocks(stocks);
                    if (!validStocks.isEmpty()) {
                        String pickDate = normalizeDateStr(firstNonBlankStr(ev.get("capturedAt"), ev.get("messageTime"),
                                String.valueOf(now)));
                        if (!pickDate.isEmpty()) {
                            for (Map<String, Object> stock : validStocks) {
                                Map<String, Object> tk = new LinkedHashMap<>();
                                tk.put("id", id + "_" + stock.get("code"));
                                tk.put("eventId", id);
                                tk.put("chatName", cleanChatName);
                                tk.put("sender", finalSender);
                                tk.put("stockCode", stock.get("code"));
                                tk.put("stockName", stock.getOrDefault("name", ""));
                                tk.put("pickDate", pickDate);
                                tk.put("pickMessage", messageText);
                                tk.put("createdAt", now);
                                tk.put("updatedAt", now);
                                trackingMapper.insertIgnore(tk);
                            }
                        }
                    }
                } catch (Exception e) {
                    // 自动同步追踪表失败
                }
            }
            return category;
        } catch (Exception err) {
            return !str(ev.get("category")).isEmpty() ? str(ev.get("category")) : "market_news";
        }
    }

    /** 等价 loadEventsFromDb()，失败返回空列表。 */
    public List<Map<String, Object>> loadEventsFromDb() {
        try {
            List<Map<String, Object>> rows = eventMapper.listAll();
            List<Map<String, Object>> out = new ArrayList<>();
            for (Map<String, Object> r : rows) {
                String cat = str(r.get("category"));
                if (cat.isEmpty() || !List.of("stock_pick", "market_news", "marketing").contains(cat)) {
                    cat = "market_news";
                }
                LinkedHashMap<String, Object> item = new LinkedHashMap<>();
                item.put("id", r.get("id"));
                item.put("chatName", r.get("chat_name"));
                item.put("sender", r.get("sender"));
                item.put("usefulMessage", r.get("message_text"));
                item.put("messageTime", r.get("message_time"));
                item.put("capturedAt", r.get("captured_at"));
                item.put("stocks", parseJsonValue(str(r.get("stocks_json"))));
                item.put("urls", parseJsonValue(str(r.get("urls_json"))));
                item.put("category", cat);
                out.add(item);
            }
            return out;
        } catch (Exception err) {
            return new ArrayList<>();
        }
    }

    /** 等价 deleteWechatEvent(id)：先删内存，再删 daily→tracking→event。 */
    public Map<String, Object> deleteWechatEvent(String id) {
        monitorState.events.removeIf(e -> String.valueOf(e.get("id")).equals(String.valueOf(id)));
        try {
            List<Map<String, Object>> tkRows = trackingMapper.listIdsByEventId(id);
            if (!tkRows.isEmpty()) {
                List<String> tkIds = new ArrayList<>();
                for (Map<String, Object> r : tkRows) {
                    tkIds.add(str(r.get("id")));
                }
                trackingMapper.deleteDailyByTrackingIds(tkIds);
                trackingMapper.deleteByEventId(id);
            }
            eventMapper.deleteById(id);
        } catch (Exception err) {
            // 删除失败不影响返回
        }
        LinkedHashMap<String, Object> out = new LinkedHashMap<>();
        out.put("deleted", 1);
        out.put("remaining", monitorState.events.size());
        return out;
    }

    /** 清空事件。category 为空则清空全部；否则仅清空该分类的事件与关联 tracking。 */
    public Map<String, Object> clearWechatEvents(String category) {
        int count = monitorState.events.size();
        if (category == null || category.isEmpty()) {
            monitorState.events.clear();
            try {
                List<Map<String, Object>> allTk = trackingMapper.listAllIds();
                if (!allTk.isEmpty()) {
                    List<String> ids = new ArrayList<>();
                    for (Map<String, Object> r : allTk) {
                        ids.add(str(r.get("id")));
                    }
                    trackingMapper.deleteDailyByTrackingIds(ids);
                }
                trackingMapper.deleteAll();
                eventMapper.deleteAll();
            } catch (Exception err) {
                // 清空失败不影响返回
            }
            LinkedHashMap<String, Object> out = new LinkedHashMap<>();
            out.put("deleted", count);
            return out;
        }
        List<String> eventIds = new ArrayList<>();
        try {
            for (Map<String, Object> r : eventMapper.listIdsByCategory(category)) {
                eventIds.add(str(r.get("id")));
            }
        } catch (Exception ignored) {
            // 忽略
        }
        final String cat = category;
        monitorState.events.removeIf(e -> cat.equals(String.valueOf(e.get("category"))));
        try {
            for (String eid : eventIds) {
                List<Map<String, Object>> tkRows = trackingMapper.listIdsByEventId(eid);
                if (!tkRows.isEmpty()) {
                    List<String> tkIds = new ArrayList<>();
                    for (Map<String, Object> r : tkRows) {
                        tkIds.add(str(r.get("id")));
                    }
                    trackingMapper.deleteDailyByTrackingIds(tkIds);
                    trackingMapper.deleteByEventId(eid);
                }
                eventMapper.deleteById(eid);
            }
        } catch (Exception ignored) {
            // 忽略
        }
        LinkedHashMap<String, Object> out = new LinkedHashMap<>();
        out.put("deleted", count - monitorState.events.size());
        return out;
    }

    /** 等价 DELETE /api/wechat/events?category=xxx 的分类清空分支。 */
    public Map<String, Object> clearEventsByCategory(String category) {
        List<String> ids = new ArrayList<>();
        try {
            for (Map<String, Object> r : eventMapper.listIdsByCategory(category)) {
                ids.add(str(r.get("id")));
            }
        } catch (Exception ignored) {
            // 忽略
        }
        if (!ids.isEmpty()) {
            try {
                List<Map<String, Object>> tracks = trackingMapper.listIdsByEventIds(ids);
                List<String> tkIds = new ArrayList<>();
                for (Map<String, Object> r : tracks) {
                    tkIds.add(str(r.get("id")));
                }
                if (!tkIds.isEmpty()) {
                    trackingMapper.deleteDailyByTrackingIds(tkIds);
                }
                trackingMapper.deleteByEventIds(ids);
                eventMapper.deleteByIds(ids);
            } catch (Exception ignored) {
                // 忽略
            }
        }
        int before = monitorState.events.size();
        monitorState.events.removeIf(e -> category.equals(String.valueOf(e.get("category"))));
        LinkedHashMap<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("deleted", before - monitorState.events.size());
        out.put("category", category);
        return out;
    }

    /** 等价 purgeEventsNotInList(db, keepIds)：返回删除的 event 行数。 */
    public int purgeEventsNotInList(List<String> keepIds) {
        if (keepIds == null || keepIds.isEmpty()) {
            return 0;
        }
        try {
            List<Map<String, Object>> orphanTk = trackingMapper.listOrphanTrackingIds(keepIds);
            if (!orphanTk.isEmpty()) {
                List<String> tkIds = new ArrayList<>();
                for (Map<String, Object> r : orphanTk) {
                    tkIds.add(str(r.get("id")));
                }
                trackingMapper.deleteDailyByTrackingIds(tkIds);
            }
            trackingMapper.deleteTrackingNotIn(keepIds);
            return eventMapper.deleteNotIn(keepIds);
        } catch (Exception err) {
            return 0;
        }
    }

    /** 等价 updateWechatEventCategoryInMemory(id, category, sender)。 */
    public void updateWechatEventCategoryInMemory(String id) {
        updateWechatEventCategoryInMemory(id, null, null);
    }

    public void updateWechatEventCategoryInMemory(String id, String category, String sender) {
        Map<String, Object> e = monitorState.findEvent(id);
        if (e != null) {
            if (category != null) {
                e.put("category", category);
            }
            if (sender != null) {
                e.put("sender", sender);
            }
        }
    }

    public WechatFeedbackMapper feedbackMapper() {
        return feedbackMapper;
    }

    /** 供监听/重试流程复用：INSERT IGNORE tracking。 */
    public void insertTrackingIgnore(Map<String, Object> data) {
        trackingMapper.insertIgnore(data);
    }

    public WechatEventMapper eventMapperRef() {
        return eventMapper;
    }

    // ==================================================================
    // 通用小工具
    // ==================================================================

    public static String str(Object o) {
        return o == null ? "" : (o instanceof String ? (String) o : String.valueOf(o));
    }

    static String forceStr(String s) {
        return s == null ? "" : s;
    }

    static String firstNonBlankStr(Object... values) {
        for (Object v : values) {
            String s = v == null ? "" : String.valueOf(v);
            if (!s.isEmpty()) {
                return s;
            }
        }
        return "";
    }

    public static String randomBase36(int len) {
        String chars = "0123456789abcdefghijklmnopqrstuvwxyz";
        StringBuilder sb = new StringBuilder();
        java.util.Random rnd = new java.util.Random();
        for (int i = 0; i < len; i++) {
            sb.append(chars.charAt(rnd.nextInt(chars.length())));
        }
        return sb.toString();
    }

    private static List<Map<String, Object>> filterValidStocks(List<Map<String, Object>> stocks) {
        List<Map<String, Object>> valid = new ArrayList<>();
        for (Map<String, Object> s : stocks) {
            if (s == null || s.get("code") == null) {
                continue;
            }
            if (str(s.get("code")).trim().matches("\\d{6}")) {
                valid.add(s);
            }
        }
        return valid;
    }

    Map<String, Object> parseJsonMap(String json) {
        try {
            Object parsed = OM.readValue(json, Object.class);
            return castMap(parsed);
        } catch (Exception e) {
            return new LinkedHashMap<>();
        }
    }

    Object parseJsonValue(String json) {
        if (json == null || json.isEmpty()) {
            return new ArrayList<>();
        }
        try {
            return OM.readValue(json, Object.class);
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> castMap(Object o) {
        if (o instanceof Map) {
            return new LinkedHashMap<>((Map<String, Object>) o);
        }
        return new LinkedHashMap<>();
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> parseJsonList(String json) {
        Object v = parseJsonValue(json);
        if (v instanceof List) {
            List<Map<String, Object>> out = new ArrayList<>();
            for (Object item : (List<Object>) v) {
                if (item instanceof Map) {
                    out.add(castMap(item));
                }
            }
            return out;
        }
        return new ArrayList<>();
    }

    public String toJson(Object value) {
        try {
            return OM.writeValueAsString(value);
        } catch (Exception e) {
            return "[]";
        }
    }

}
