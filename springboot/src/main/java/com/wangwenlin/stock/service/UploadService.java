package com.wangwenlin.stock.service;

import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.config.AppProperties;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.nio.file.Files;
import java.nio.file.Path;

/**
 * 租户上传目录解析 —— 与 Node 端 backend/uploads.js 的 tenantUploadDir / tenantUploadPath 逐条对齐。
 * 两侧共用同一个 uploads/ 物理目录：Node 侧负责写入，Spring 侧负责读取，迁移期文件互通。
 */
@Service
public class UploadService {

    private static final String UPLOADS = "uploads/";

    private final AppProperties properties;

    public UploadService(AppProperties properties) {
        this.properties = properties;
    }

    /** 等价 tenantUploadPath(value)，value 形如 {@code uploads/users/1/icons/a.png}。 */
    public Path resolveTenantPath(long userId, String value) {
        if (value == null) {
            throw new IllegalArgumentException("无效文件路径");
        }
        String normalized = value.replace('\\', '/').replaceFirst("^/", "");
        // 与 Node 完全一致：scoped 始终保留 uploads/ 前缀，后续按前缀长度裁掉
        String prefix = "uploads/users/" + userId + "/";
        String scoped = normalized.startsWith("uploads/users/")
                ? normalized
                : normalized.replaceFirst("^uploads/", prefix);
        if (!scoped.startsWith(prefix)) {
            throw new IllegalArgumentException("文件不属于当前用户");
        }
        for (String part : scoped.split("/", -1)) {
            if ("..".equals(part) || ".".equals(part)) {
                throw new IllegalArgumentException("文件不属于当前用户");
            }
        }
        if (scoped.indexOf('\0') >= 0) {
            throw new IllegalArgumentException("文件不属于当前用户");
        }
        Path root = properties.uploadRootPath();
        Path resolved = root.resolve(scoped.substring(UPLOADS.length())).normalize();
        Path tenantRoot = root.resolve("users").resolve(String.valueOf(userId));
        if (!resolved.startsWith(tenantRoot)) {
            throw new IllegalArgumentException("非法文件路径");
        }
        return resolved;
    }

    /**
     * 落盘一个上传文件到租户目录，返回 Node 端风格的相对路径 {@code uploads/<category>/<filename>}
     * （该路径在回包时由 UploadUrlJsonConverter 改写成 uploads/users/&lt;uid&gt;/...）。
     *
     * @param maxBytes 单文件体积上限，超限按 multer 的 LIMIT_FILE_SIZE 回 400 File too large
     */
    public String store(long userId, String category, MultipartFile file, String filename, long maxBytes) {
        if (file.getSize() > maxBytes) {
            throw new ApiException(400, "File too large");
        }
        Path directory = ensureTenantDir(userId, category);
        try {
            file.transferTo(directory.resolve(filename).toAbsolutePath());
        } catch (Exception error) {
            throw new ApiException(400, "上传失败");
        }
        return "uploads/" + category + "/" + filename;
    }

    /**
     * 等价 JS {@code path.extname(name)}：返回最后一个路径分隔符之后的最后一个 {@code .} 起的内容；
     * 无扩展名（含 {@code .env} 这类纯前导点）返回空串。分隔符同时认 {@code /} 与 {@code \}。
     */
    public static String extname(String name) {
        if (name == null || name.isEmpty()) {
            return "";
        }
        int separator = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
        int dot = name.lastIndexOf('.');
        return dot <= separator + 1 ? "" : name.substring(dot);
    }

    /** 等价 tenantUploadDir(category)，供后续上传接口复用。 */
    public Path ensureTenantDir(long userId, String category) {
        if (category == null || !category.matches("^[a-z]+$")) {
            throw new IllegalArgumentException("无效上传分类");
        }
        Path directory = properties.uploadRootPath().resolve("users").resolve(String.valueOf(userId)).resolve(category);
        try {
            Files.createDirectories(directory);
        } catch (Exception ignored) {
            // 与 Node 端一致：目录已存在或创建失败都直接交给后续读写行为暴露
        }
        return directory;
    }
}
