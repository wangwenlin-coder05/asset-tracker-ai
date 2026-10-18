package com.wangwenlin.stock.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.LinkedHashSet;
import java.util.Set;

/**
 * 对齐 Node 端 backend/auth.js 的运行时配置开关。
 */
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    /** 允许的来源，逗号分隔；对齐 allowedOrigins()。 */
    private String allowedOrigins = "http://localhost:3300,http://127.0.0.1:3300,http://localhost:5273,http://127.0.0.1:5273";

    private boolean cookieSecure = false;

    private boolean registrationOpen = false;

    private boolean enableLocalFeatures = false;

    /**
     * 仓库根目录（等价 Node 端 __dirname）。Spring Boot 以 springboot/ 为工作目录启动，默认取上一级。
     * 用于定位 quant/stock_news.py 与 .cache/kline 缓存目录。
     */
    private String projectDir = "..";

    /**
     * 上传文件根目录。对齐 Node 端 backend/uploads.js：UPLOAD_ROOT 优先，否则取 &lt;仓库根&gt;/uploads。
     * 留空表示按默认推导。
     */
    private String uploadRoot = "";

    public java.nio.file.Path uploadRootPath() {
        if (uploadRoot != null && !uploadRoot.isBlank()) {
            return new java.io.File(uploadRoot).getAbsoluteFile().toPath().normalize();
        }
        return new java.io.File(projectDir == null || projectDir.isBlank() ? ".." : projectDir)
                .getAbsoluteFile().toPath().normalize()
                .resolve("uploads");
    }

    public Set<String> originSet() {
        Set<String> result = new LinkedHashSet<>();
        for (String value : allowedOrigins.split(",")) {
            String trimmed = value.trim();
            if (!trimmed.isEmpty()) {
                result.add(trimmed);
            }
        }
        return result;
    }

    public String getAllowedOrigins() {
        return allowedOrigins;
    }

    public void setAllowedOrigins(String allowedOrigins) {
        this.allowedOrigins = allowedOrigins;
    }

    public boolean isCookieSecure() {
        return cookieSecure;
    }

    public void setCookieSecure(boolean cookieSecure) {
        this.cookieSecure = cookieSecure;
    }

    public boolean isRegistrationOpen() {
        return registrationOpen;
    }

    public void setRegistrationOpen(boolean registrationOpen) {
        this.registrationOpen = registrationOpen;
    }

    public boolean isEnableLocalFeatures() {
        return enableLocalFeatures;
    }

    public void setEnableLocalFeatures(boolean enableLocalFeatures) {
        this.enableLocalFeatures = enableLocalFeatures;
    }

    public String getProjectDir() {
        return projectDir;
    }

    public void setProjectDir(String projectDir) {
        this.projectDir = projectDir;
    }

    public String getUploadRoot() {
        return uploadRoot;
    }

    public void setUploadRoot(String uploadRoot) {
        this.uploadRoot = uploadRoot;
    }
}
