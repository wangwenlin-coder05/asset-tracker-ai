import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class WechatStockExtractor {
    // Match 【股票名 6位代码】 with optional prefix like [红包], 🎁, ⭕, etc.
    private static final Pattern STOCK_PATTERN = Pattern.compile("(?:^|[^\\w\\[\\]]*)【\\s*([^】]*?)\\s+([0-9]{6})\\s*】");
    // Also match standalone 【股票名】 followed by bare 6-digit code on same or next line
    private static final Pattern BRACKET_NAME_CODE_PATTERN = Pattern.compile("【\\s*([^】]{2,15})\\s*】\\s*(?:[^\\d]*?)([0-9]{6})");
    // Match bare "股票名 6位代码" without brackets (common format)
    private static final Pattern BARE_NAME_CODE_PATTERN = Pattern.compile("([\\u4e00-\\u9fa5A-Za-z]{2,10})\\s+([0-9]{6})(?!\\d)");
    // URL extraction pattern
    private static final Pattern URL_PATTERN = Pattern.compile("https?://[\\w\\-._~:/?#\\[\\]@!$&'()*+,;=%]+");
    private static final Pattern DATE_CN_PATTERN = Pattern.compile("(?:(20\\d{2})年)?(\\d{1,2})月(\\d{1,2})日");
    private static final Pattern DATE_DOT_PATTERN = Pattern.compile("(?<!\\d)(\\d{1,2})[./-](\\d{1,2})(?!\\d)");
    private static final Pattern QT_NOISE_PATTERN = Pattern.compile("^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*){2,}$");
    private static final Pattern SENDER_LABEL_PATTERN = Pattern.compile("^(?:发送人|联系人|群聊)\\s*[:：]\\s*(.+)$");
    private static final Pattern SENDER_TIME_PATTERN = Pattern.compile("^(.{1,40}?)\\s+(?:上午|下午)?\\s*\\d{1,2}:\\d{2}$");
    private static final Pattern SENDER_INLINE_PATTERN = Pattern.compile("^([^【】\\[\\]：:]{1,30})[:：]\\s*(.+)$");

    // Non-stock name blacklist - these should NOT be treated as stock names
    private static final String[] NON_STOCK_NAMES = {
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
        "推送", "推荐",
        "每日", "今日",
        "早盘", "尾盘",
        "盘后", "盘中",
    };

    private WechatStockExtractor() {}

    public static void main(String[] args) throws Exception {
        System.setOut(new PrintStream(System.out, true, StandardCharsets.UTF_8));
        System.setErr(new PrintStream(System.err, true, StandardCharsets.UTF_8));
        String senderHint = args.length > 0
                ? new String(Base64.getDecoder().decode(args[0]), StandardCharsets.UTF_8)
                : "";
        StringBuilder input = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (input.length() > 0) input.append('\n');
                input.append(line);
            }
        }
        System.out.print(extract(input.toString(), senderHint).toJson());
    }

    // Check if a name is in the blacklist (non-stock names)
    private static boolean isNonStockName(String name) {
        if (name == null || name.isEmpty()) return true;
        String trimmed = name.trim();
        for (String nonStock : NON_STOCK_NAMES) {
            if (trimmed.equals(nonStock) || trimmed.startsWith(nonStock)) return true;
        }
        return false;
    }

    // Check if the 6-digit code is part of a longer number sequence (like license number A0470625090009)
    private static boolean codeIsPartOfLongerNumber(String line, int codeStart, String code) {
        int codeEnd = codeStart + code.length();
        // Check if there are more digits after the code
        if (codeEnd < line.length() && Character.isDigit(line.charAt(codeEnd))) {
            return true;
        }
        // Check if the code is preceded by digits or a letter+digit pattern (like A047062)
        if (codeStart > 0) {
            char prevChar = line.charAt(codeStart - 1);
            // If preceded by a letter (like A in A047062), it's likely part of a license number
            if (Character.isLetter(prevChar)) {
                return true;
            }
            // If preceded by digits, check if the whole thing is a longer number
            if (Character.isDigit(prevChar)) {
                // Look back to find the start of this number sequence
                int start = codeStart - 1;
                while (start >= 0 && Character.isDigit(line.charAt(start))) start--;
                int totalLen = codeEnd - start - 1;
                if (totalLen > 6) return true;
            }
        }
        return false;
    }

    // Extract URLs from text
    private static List<String> extractUrls(String text) {
        List<String> urls = new ArrayList<>();
        Matcher urlMatcher = URL_PATTERN.matcher(text);
        while (urlMatcher.find()) {
            String url = urlMatcher.group();
            // Clean trailing punctuation that might be part of the URL
            while (url.endsWith("。") || url.endsWith(".") || url.endsWith(",")) {
                url = url.substring(0, url.length() - 1);
            }
            if (!urls.contains(url)) {
                urls.add(url);
            }
        }
        return urls;
    }

    static ExtractionResult extract(String rawText, String senderHint) {
        String normalized = rawText == null ? "" : rawText.replace("\r\n", "\n").replace('\r', '\n').trim();
        String sender = cleanSender(senderHint);
        String date = detectDate(normalized);
        List<StockPick> stocks = new ArrayList<>();
        List<String> urls = extractUrls(normalized);
        List<String> usefulLines = new ArrayList<>();
        int nonEmptyLineCount = 0;

        for (String originalLine : normalized.split("\\n")) {
            String line = originalLine.trim();
            if (line.isEmpty()) continue;
            // Filter Qt control path noise like "chat_message_list.qt_scrollarea_viewport.chat_bubble_item_view"
            if (QT_NOISE_PATTERN.matcher(line).matches()) continue;
            nonEmptyLineCount++;

            if (sender.isEmpty()) {
                Matcher labelledSender = SENDER_LABEL_PATTERN.matcher(line);
                Matcher timedSender = SENDER_TIME_PATTERN.matcher(line);
                Matcher inlineSender = SENDER_INLINE_PATTERN.matcher(line);
                if (labelledSender.matches()) {
                    sender = cleanSender(labelledSender.group(1));
                    continue;
                }
                if (timedSender.matches() && !containsStockCode(line)) {
                    sender = cleanSender(timedSender.group(1));
                    continue;
                }
                if (inlineSender.matches() && !line.toLowerCase().startsWith("http") && !containsStockCode(line)) {
                    sender = cleanSender(inlineSender.group(1));
                    line = inlineSender.group(2).trim();
                }
            }

            // Pattern 1: 【股票名 代码】format (most common)
            Matcher stockMatcher = STOCK_PATTERN.matcher(line);
            while (stockMatcher.find()) {
                String name = stockMatcher.group(1).replaceAll("\\s+", "").replaceAll("^[⭕🔥\\[\\]红包]+", "");
                String code = stockMatcher.group(2);
                if (!name.isEmpty() && !isNonStockName(name)) {
                    int existingIndex = findStock(stocks, code);
                    if (existingIndex < 0) {
                        String logic = extractLogic(line, code);
                        stocks.add(new StockPick(name, code, logic));
                    } else {
                        String logic = extractLogic(line, code);
                        if (!logic.isEmpty() && stocks.get(existingIndex).logic.isEmpty()) {
                            stocks.set(existingIndex, new StockPick(name, code, logic));
                        }
                    }
                }
            }

            // Pattern 2: 【股票名】 followed by bare code on same line
            Matcher bracketMatcher = BRACKET_NAME_CODE_PATTERN.matcher(line);
            while (bracketMatcher.find()) {
                String name = bracketMatcher.group(1).replaceAll("\\s+", "").replaceAll("^[⭕🔥\\[\\]红包]+", "");
                String code = bracketMatcher.group(2);
                if (!name.isEmpty() && !isNonStockName(name)) {
                    int existingIndex = findStock(stocks, code);
                    if (existingIndex < 0) {
                        String logic = extractLogic(line, code);
                        stocks.add(new StockPick(name, code, logic));
                    } else {
                        String logic = extractLogic(line, code);
                        if (!logic.isEmpty() && stocks.get(existingIndex).logic.isEmpty()) {
                            stocks.set(existingIndex, new StockPick(name, code, logic));
                        }
                    }
                }
            }

            // Pattern 3: bare "股票名 6位代码" without brackets
            // More conservative: require the code to NOT be part of a longer number (like license numbers)
            Matcher bareMatcher = BARE_NAME_CODE_PATTERN.matcher(line);
            while (bareMatcher.find()) {
                String name = bareMatcher.group(1).replaceAll("\\s+", "");
                String code = bareMatcher.group(2);
                int codeStart = bareMatcher.start(2);
                
                // Skip if name is in blacklist or code is part of a longer number
                if (!name.isEmpty() && !isNonStockName(name) && !codeIsPartOfLongerNumber(line, codeStart, code)) {
                    int existingIndex = findStock(stocks, code);
                    if (existingIndex < 0) {
                        String logic = extractLogic(line, code);
                        stocks.add(new StockPick(name, code, logic));
                    } else {
                        String logic = extractLogic(line, code);
                        if (!logic.isEmpty() && stocks.get(existingIndex).logic.isEmpty()) {
                            stocks.set(existingIndex, new StockPick(name, code, logic));
                        }
                    }
                }
            }

            // Always include all lines to preserve full message content
            usefulLines.add(cleanUsefulLine(line));
        }

        if (sender.isEmpty()) sender = ""; // 未识别时留空，后续再尝试识别，不要写"未识别发送人"
        String usefulMessage = String.join("\n", usefulLines);
        int filteredLineCount = Math.max(0, nonEmptyLineCount - usefulLines.size());
        return new ExtractionResult(sender, date, normalized, usefulMessage, stocks, urls, filteredLineCount);
    }

    private static int findStock(List<StockPick> stocks, String code) {
        for (int i = 0; i < stocks.size(); i++) {
            if (stocks.get(i).code.equals(code)) return i;
        }
        return -1;
    }

    private static boolean containsStockCode(String line) {
        return Pattern.compile("(?<!\\d)[0-9]{6}(?!\\d)").matcher(line).find();
    }

    private static boolean isUsefulHeader(String line) {
        String compact = line.replaceAll("\\s+", "");
        if (compact.matches("^(?:👉|回复|回【|官方指导价|新客户特惠).*")
                || compact.matches(".*(?:合作后|预约“?每日掘金|仓位跟上).*$")) return false;
        return compact.contains("今日早盘观察")
                || compact.contains("短线优选")
                || compact.contains("每日推荐")
                || compact.contains("每日掘金")
                || compact.contains("票来了")
                || compact.matches(".*\\d{1,2}月\\d{1,2}日.*(?:观察|优选|推荐|股票|票).*?");
    }

    private static String cleanUsefulLine(String line) {
        return line.replaceFirst("^[，,、；;\\s]+", "").trim();
    }

    private static String detectDate(String text) {
        // 推票日期一般在消息开头（"8月6日 星期四 早盘观察"），
        // 行情复盘里大量提到历史日期（"6月23日开启的赛道退潮"），
        // 所以只在前 100 字符里找，避免抓到复盘的历史日期。
        String head = text == null ? "" : text.length() > 100 ? text.substring(0, 100) : text;
        LocalDate now = LocalDate.now();

        Matcher cn = DATE_CN_PATTERN.matcher(head);
        if (cn.find()) {
            int year = cn.group(1) == null ? now.getYear() : Integer.parseInt(cn.group(1));
            int month = Integer.parseInt(cn.group(2));
            int day = Integer.parseInt(cn.group(3));
            String candidate = safeDate(year, month, day);
            if (candidate != null && !isDateTooOld(LocalDate.of(year, month, day), now, 14)) {
                return candidate;
            }
        }
        Matcher dot = DATE_DOT_PATTERN.matcher(head);
        if (dot.find()) {
            int month = Integer.parseInt(dot.group(1));
            int day = Integer.parseInt(dot.group(2));
            String candidate = safeDate(now.getYear(), month, day);
            if (candidate != null && !isDateTooOld(LocalDate.of(now.getYear(), month, day), now, 14)) {
                return candidate;
            }
        }
        return "";
    }

    private static boolean isDateTooOld(LocalDate candidate, LocalDate now, int maxDays) {
        return Math.abs(java.time.temporal.ChronoUnit.DAYS.between(candidate, now)) > maxDays;
    }

    private static String safeDate(int year, int month, int day) {
        try {
            return LocalDate.of(year, month, day).toString();
        } catch (Exception ignored) {
            return "";
        }
    }

    private static String cleanSender(String sender) {
        if (sender == null) return "";
        return sender.trim().replaceAll("^[【\\[]|[】\\]]$", "").trim();
    }

    private static String cleanLogic(String logic) {
        if (logic == null) return "";
        return logic.trim().replaceFirst("^[：:+\\-—|丨]+", "").trim();
    }

    // Extract logic from Chinese parentheses （）after a stock code
    private static String extractLogic(String line, String code) {
        int idx = line.indexOf(code);
        if (idx < 0) return "";
        String after = line.substring(idx + code.length());
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("[（(]\\s*([^）)]+?)\\s*[）)]").matcher(after);
        return m.find() ? m.group(1).trim() : "";
    }

    private static String json(String value) {
        if (value == null) return "\"\"";
        StringBuilder escaped = new StringBuilder(value.length() + 16);
        escaped.append('"');
        for (int i = 0; i < value.length(); i++) {
            char ch = value.charAt(i);
            switch (ch) {
                case '"': escaped.append("\\\""); break;
                case '\\': escaped.append("\\\\"); break;
                case '\b': escaped.append("\\b"); break;
                case '\f': escaped.append("\\f"); break;
                case '\n': escaped.append("\\n"); break;
                case '\r': escaped.append("\\r"); break;
                case '\t': escaped.append("\\t"); break;
                default:
                    if (ch < 0x20) escaped.append(String.format("\\u%04x", (int) ch));
                    else escaped.append(ch);
            }
        }
        return escaped.append('"').toString();
    }

    static final class StockPick {
        final String name;
        final String code;
        final String logic;

        private StockPick(String name, String code, String logic) {
            this.name = name;
            this.code = code;
            this.logic = logic;
        }

        String toJson() {
            return "{\"name\":" + json(name) + ",\"code\":" + json(code) + ",\"logic\":" + json(logic) + "}";
        }
    }

    static final class ExtractionResult {
        final String sender;
        final String recommendationDate;
        final String originalMessage;
        final String usefulMessage;
        final List<StockPick> stocks;
        final List<String> urls;
        final int filteredLineCount;

        private ExtractionResult(String sender, String recommendationDate, String originalMessage,
                                 String usefulMessage, List<StockPick> stocks, List<String> urls, int filteredLineCount) {
            this.sender = sender;
            this.recommendationDate = recommendationDate;
            this.originalMessage = originalMessage;
            this.usefulMessage = usefulMessage;
            this.stocks = stocks;
            this.urls = urls;
            this.filteredLineCount = filteredLineCount;
        }

        String toJson() {
            StringBuilder result = new StringBuilder();
            result.append("{\"sender\":").append(json(sender));
            result.append(",\"recommendationDate\":").append(json(recommendationDate));
            result.append(",\"originalMessage\":").append(json(originalMessage));
            result.append(",\"usefulMessage\":").append(json(usefulMessage));
            result.append(",\"filteredLineCount\":").append(filteredLineCount);
            result.append(",\"stocks\":[");
            for (int i = 0; i < stocks.size(); i++) {
                if (i > 0) result.append(',');
                result.append(stocks.get(i).toJson());
            }
            result.append("],\"urls\":[");
            for (int i = 0; i < urls.size(); i++) {
                if (i > 0) result.append(',');
                result.append(json(urls.get(i)));
            }
            return result.append("]}").toString();
        }
    }
}
