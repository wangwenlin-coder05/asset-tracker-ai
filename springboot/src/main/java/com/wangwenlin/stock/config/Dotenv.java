package com.wangwenlin.stock.config;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 对齐 Node 端 {@code require('dotenv').config()}：把仓库根目录的 .env 读取为最低优先级的配置项。
 *
 * <p>Node 以仓库根为工作目录启动，.env 就在根目录；Spring Boot 以 springboot/ 为工作目录启动，
 * 故先查当前目录再查上一级。读取结果经 {@code SpringApplication#setDefaultProperties} 注入，
 * 真实环境变量仍具有更高优先级 —— 与 dotenv 默认「不覆盖已存在的环境变量」语义一致。
 *
 * <p>ALLOWED_ORIGINS 特意跳过：application.yml 里的默认值已包含 Node 端全部来源并额外放行 8088 自身，
 * 直接沿用即可，避免装载 .env 后反而丢掉 8088。
 */
public final class Dotenv {

    private Dotenv() {
    }

    public static Map<String, Object> load() {
        Map<String, Object> properties = new LinkedHashMap<>();
        Path file = find();
        if (file == null) {
            return properties;
        }
        List<String> lines;
        try {
            lines = Files.readAllLines(file, StandardCharsets.UTF_8);
        } catch (IOException ignored) {
            return properties;
        }
        for (String raw : lines) {
            String line = raw.trim();
            if (line.isEmpty() || line.startsWith("#")) {
                continue;
            }
            if (line.startsWith("export ")) {
                line = line.substring(7).trim();
            }
            int index = line.indexOf('=');
            if (index <= 0) {
                continue;
            }
            String key = line.substring(0, index).trim();
            String value = line.substring(index + 1).trim();
            if (value.length() >= 2
                    && ((value.charAt(0) == '"' && value.charAt(value.length() - 1) == '"')
                    || (value.charAt(0) == '\'' && value.charAt(value.length() - 1) == '\''))) {
                value = value.substring(1, value.length() - 1);
            }
            if (!key.isEmpty() && !ALLOWED_ORIGINS.equals(key)) {
                properties.put(key, value);
                // 静态工具类（如 SecretCrypto 读取 KEY_ENCRYPTION_KEY）走 System.getProperty/getenv，
                // 这里补一份 System 属性；仅在该 key 尚未由真实环境变量提供时写入，保持「环境变量优先」。
                if (System.getProperty(key) == null && System.getenv(key) == null) {
                    System.setProperty(key, value);
                }
            }
        }
        return properties;
    }

    private static final String ALLOWED_ORIGINS = "ALLOWED_ORIGINS";

    private static Path find() {
        Path cwd = Paths.get("").toAbsolutePath();
        Path local = cwd.resolve(".env");
        if (Files.exists(local)) {
            return local;
        }
        Path parent = cwd.resolve("..").resolve(".env").normalize();
        return Files.exists(parent) ? parent : null;
    }
}
