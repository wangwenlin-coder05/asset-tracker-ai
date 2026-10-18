package com.wangwenlin.stock.web;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * 前端产物目录定位。对齐 Node 端 server.js:1150 的
 * {@code express.static(path.join(__dirname, 'frontend', 'dist'))}（{@code __dirname} 即仓库根）。
 *
 * <p>可用 {@code app.frontend-dist} / 环境变量 {@code FRONTEND_DIST} 显式指定；未指定时从当前工作目录
 * 逐级向上找 {@code frontend/dist}，这样从 {@code springboot/} 或仓库根启动都能命中。
 */
@Component
public class FrontendDist {

    private final Path directory;

    public FrontendDist(@Value("${app.frontend-dist:}") String configured) {
        this.directory = resolve(configured);
    }

    public Path directory() {
        return directory;
    }

    public Path indexHtml() {
        return directory.resolve("index.html");
    }

    /** 供 WebMvc 资源处理器使用，必须带结尾斜杠。 */
    public String locationUri() {
        String uri = directory.toUri().toString();
        return uri.endsWith("/") ? uri : uri + "/";
    }

    private static Path resolve(String configured) {
        if (configured != null && !configured.isBlank()) {
            return Paths.get(configured).toAbsolutePath().normalize();
        }
        Path cursor = Paths.get(System.getProperty("user.dir")).toAbsolutePath().normalize();
        for (int depth = 0; depth < 4 && cursor != null; depth++) {
            Path candidate = cursor.resolve("frontend").resolve("dist");
            if (Files.isDirectory(candidate)) {
                return candidate;
            }
            cursor = cursor.getParent();
        }
        return Paths.get(System.getProperty("user.dir")).resolve("..").resolve("frontend").resolve("dist")
                .toAbsolutePath().normalize();
    }
}
