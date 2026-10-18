package com.wangwenlin.stock.web;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * 首页。对齐 Node 端 server.js:1151 的
 * {@code app.get('/', (req, res) => res.sendFile(...))}：直接吐 {@code frontend/dist/index.html}。
 * 前端是单页应用（无 vue-router），产物里的资源引用都是 {@code /assets/...} 绝对路径，
 * 由 WebConfig 上的 {@code /**} 资源处理器兜住，因此这里只需要处理 {@code /} 一个入口。
 */
@Controller
public class FrontendController {

    private final FrontendDist frontendDist;

    public FrontendController(FrontendDist frontendDist) {
        this.frontendDist = frontendDist;
    }

    @GetMapping("/")
    public ResponseEntity<Resource> index() throws IOException {
        Path file = frontendDist.indexHtml();
        if (!Files.isReadable(file)) {
            return ResponseEntity.notFound().build();
        }
        // 对齐 Express sendFile 的响应头：text/html; charset=UTF-8 + Content-Length + Last-Modified
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, "text/html; charset=UTF-8")
                .contentLength(Files.size(file))
                .lastModified(Files.getLastModifiedTime(file).toMillis())
                .body(new FileSystemResource(file));
    }
}
