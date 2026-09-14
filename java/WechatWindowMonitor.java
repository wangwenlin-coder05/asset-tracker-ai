import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class WechatWindowMonitor {
    private static final int MAX_SEEN_MESSAGES = 500;

    private WechatWindowMonitor() {}

    private static String findPython() {
        // Try common Python installation paths (Windows App alias "python" won't work in subprocess)
        String[] candidates = {
            System.getenv("LOCALAPPDATA") + "\\Programs\\Python\\Python313\\python.exe",
            System.getenv("LOCALAPPDATA") + "\\Programs\\Python\\Python312\\python.exe",
            System.getenv("LOCALAPPDATA") + "\\Programs\\Python\\Python311\\python.exe",
            "C:\\Program Files\\Python313\\python.exe",
            "C:\\Program Files\\Python312\\python.exe",
            "C:\\Python313\\python.exe",
        };
        for (String candidate : candidates) {
            if (new File(candidate).exists()) return candidate;
        }
        // Fallback: try "python3" then "python" from PATH
        return "python3";
    }

    private static ProcessBuilder buildProcess(Path scriptPath) {
        String fileName = scriptPath.getFileName().toString().toLowerCase();
        List<String> cmd = new ArrayList<>();

        if (fileName.endsWith(".py")) {
            cmd.add(findPython());
            cmd.add(scriptPath.toString());
            ProcessBuilder pb = new ProcessBuilder(cmd);
            pb.directory(scriptPath.getParent().toFile());
            pb.environment().put("PYTHONIOENCODING", "utf-8");
            return pb;
        } else if (fileName.endsWith(".ps1")) {
            // PowerShell script (legacy)
            cmd.add("powershell.exe");
            cmd.add("-NoProfile");
            cmd.add("-NonInteractive");
            cmd.add("-ExecutionPolicy");
            cmd.add("Bypass");
            cmd.add("-File");
            cmd.add(scriptPath.toString());
            return new ProcessBuilder(cmd);
        } else {
            throw new IllegalArgumentException("不支持的脚本类型: " + fileName + " (仅支持 .py 和 .ps1)");
        }
    }

    public static void main(String[] args) throws Exception {
        System.setOut(new PrintStream(System.out, true, StandardCharsets.UTF_8));
        System.setErr(new PrintStream(System.err, true, StandardCharsets.UTF_8));
        if (args.length == 0) {
            System.err.println("缺少监听脚本路径 (wechat_monitor.py 或 wechat-window-reader.ps1)");
            System.exit(2);
        }

        Path readerScript = Path.of(args[0]).toAbsolutePath().normalize();
        if (!readerScript.toFile().exists()) {
            System.err.println("脚本文件不存在: " + readerScript);
            System.exit(3);
        }

        Process process = buildProcess(readerScript)
                .redirectErrorStream(true)
                .start();
        Runtime.getRuntime().addShutdownHook(new Thread(process::destroyForcibly));

        Map<String, Boolean> seen = new LinkedHashMap<String, Boolean>() {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, Boolean> eldest) {
                return size() > MAX_SEEN_MESSAGES;
            }
        };

        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.equals("READY")) {
                    emit("{\"type\":\"ready\"}");
                    continue;
                }

                String[] parts = line.split("\\t", -1);
                if (parts.length >= 2 && parts[0].equals("STATE")) {
                    String chatName = parts.length >= 3 ? decode(parts[2]) : "";
                    emit("{\"type\":\"state\",\"state\":" + json(parts[1])
                            + ",\"chatName\":" + json(chatName) + "}");
                    continue;
                }
                if (parts.length >= 2 && parts[0].equals("ERROR")) {
                    emit("{\"type\":\"error\",\"message\":" + json(decode(parts[1])) + "}");
                    continue;
                }
                if (parts.length < 4 || !parts[0].equals("MESSAGE")) continue;

                String chatName = decode(parts[1]);
                String sender = decode(parts[2]);
                String message = decode(parts[3]);
                String messageTime = parts.length >= 5 ? decode(parts[4]) : "";
                String signature = chatName + "\u0000" + sender + "\u0000" + message;
                if (seen.put(signature, Boolean.TRUE) != null) continue;

                WechatStockExtractor.ExtractionResult result = WechatStockExtractor.extract(message, sender);

                String resultJson = result.toJson();
                emit("{\"type\":\"stock-message\",\"chatName\":" + json(chatName)
                        + ",\"capturedAt\":" + json(OffsetDateTime.now().truncatedTo(ChronoUnit.MILLIS).toString())
                        + ",\"messageTime\":" + json(messageTime)
                        + "," + resultJson.substring(1));
            }
        } finally {
            process.destroyForcibly();
        }
    }

    private static void emit(String value) {
        System.out.println(value);
        System.out.flush();
    }

    private static String decode(String value) {
        if (value == null || value.isEmpty()) return "";
        return new String(Base64.getDecoder().decode(value), StandardCharsets.UTF_8);
    }

    private static String json(String value) {
        if (value == null) return "\"\"";
        StringBuilder escaped = new StringBuilder(value.length() + 16).append('"');
        for (int i = 0; i < value.length(); i++) {
            char ch = value.charAt(i);
            switch (ch) {
                case '"': escaped.append("\\\""); break;
                case '\\': escaped.append("\\\\"); break;
                case '\n': escaped.append("\\n"); break;
                case '\r': escaped.append("\\r"); break;
                case '\t': escaped.append("\\t"); break;
                default: escaped.append(ch);
            }
        }
        return escaped.append('"').toString();
    }
}