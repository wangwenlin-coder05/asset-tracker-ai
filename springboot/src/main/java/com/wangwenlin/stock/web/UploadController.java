package com.wangwenlin.stock.web;

import com.wangwenlin.stock.common.Utf8Js;
import com.wangwenlin.stock.service.UploadService;
import com.wangwenlin.stock.tenant.UserContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Map;

/**
 * /uploads 静态文件服务（租户隔离）—— 与 Node 端 server.js 第 99 行的 app.use('/uploads', ...) 对齐。
 * <p>
 * 契约：
 * <ul>
 *   <li>只允许读取 {@code uploads/users/{当前用户id}/} 下的文件，其余一律 404 空响应体</li>
 *   <li>响应头固定 Cache-Control: private, no-store、X-Content-Type-Options: nosniff、
 *       Content-Security-Policy: default-src 'none'; sandbox、Accept-Ranges: bytes</li>
 *   <li>sendFile 的任何失败（含 Range 不可满足）在 Node 端都被 catch 成 404，故此处同样返回 404</li>
 * </ul>
 * 直接写 HttpServletResponse 而不用 ResponseEntity：需要逐字节控制 Content-Type 的原始字符串
 * （Node 的 mime-types 返回 {@code text/plain; charset=utf-8}，带空格；Spring 的 MediaType 会去掉空格），
 * 且未知后缀时 Node 完全不设置该头。
 */
@RestController
public class UploadController {

    /**
     * 与 Node 端 mime-types(mime-db) 对常用后缀的取值保持一致。
     * mime-db 收录上千种后缀，此处只覆盖本项目上传能力实际会写入的类型；
     * 未收录的后缀与 Node 一样不设置 Content-Type（浏览器此时才会自行嗅探）。
     */
    private static final Map<String, String> MIME = Map.ofEntries(
            Map.entry("png", "image/png"),
            Map.entry("jpg", "image/jpeg"),
            Map.entry("jpeg", "image/jpeg"),
            Map.entry("jpe", "image/jpeg"),
            Map.entry("gif", "image/gif"),
            Map.entry("webp", "image/webp"),
            Map.entry("bmp", "image/bmp"),
            Map.entry("svg", "image/svg+xml"),
            Map.entry("ico", "image/vnd.microsoft.icon"),
            Map.entry("tif", "image/tiff"),
            Map.entry("tiff", "image/tiff"),
            Map.entry("avif", "image/avif"),
            Map.entry("heic", "image/heic"),
            Map.entry("mp4", "video/mp4"),
            Map.entry("webm", "video/webm"),
            Map.entry("mov", "video/quicktime"),
            Map.entry("m4v", "video/x-m4v"),
            Map.entry("mp3", "audio/mpeg"),
            Map.entry("m4a", "audio/mp4"),
            Map.entry("wav", "audio/wav"),
            Map.entry("ogg", "audio/ogg"),
            Map.entry("pdf", "application/pdf"),
            Map.entry("json", "application/json"),
            Map.entry("zip", "application/zip"),
            Map.entry("txt", "text/plain; charset=utf-8"),
            Map.entry("csv", "text/csv; charset=utf-8"),
            Map.entry("html", "text/html; charset=utf-8"),
            Map.entry("htm", "text/html; charset=utf-8"),
            Map.entry("css", "text/css; charset=utf-8"),
            Map.entry("js", "text/javascript; charset=utf-8"),
            Map.entry("xml", "application/xml"),
            Map.entry("md", "text/markdown; charset=utf-8"));

    private final UploadService uploadService;

    public UploadController(UploadService uploadService) {
        this.uploadService = uploadService;
    }

    @GetMapping("/uploads/**")
    public void serve(HttpServletRequest request, HttpServletResponse response) throws IOException {
        UserContext.CurrentUser current = UserContext.require();
        // 对齐 Node：req.path 必须形如 /users/{id}/...，否则 404 空体
        String raw = request.getRequestURI();
        String contextPath = request.getContextPath();
        if (contextPath != null && !contextPath.isEmpty() && raw.startsWith(contextPath)) {
            raw = raw.substring(contextPath.length());
        }
        if (!raw.startsWith("/uploads/")) {
            notFound(response);
            return;
        }
        String withinMount = raw.substring("/uploads".length());
        if (!withinMount.startsWith("/users/" + current.id() + "/")) {
            notFound(response);
            return;
        }

        Path file;
        try {
            file = uploadService.resolveTenantPath(current.id(), "uploads" + decode(withinMount));
        } catch (Exception error) {
            notFound(response);
            return;
        }

        // 对齐 Node：路径校验通过后先落这三个头，再交给 sendFile ——
        // 因此文件不存在/读失败时，404 响应里仍然带着这三个头（上下级校验失败则没有）。
        response.setHeader("Cache-Control", "private, no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");

        byte[] content;
        try {
            if (!Files.isRegularFile(file)) {
                notFound(response);
                return;
            }
            content = Files.readAllBytes(file);
        } catch (Exception error) {
            notFound(response);
            return;
        }

        // 文件确实存在时才由 send 设置这两个头
        response.setHeader("Accept-Ranges", "bytes");
        String contentType = contentTypeOf(file.getFileName().toString());
        if (contentType != null) {
            response.setContentType(contentType);
        }

        long total = content.length;
        String rangeHeader = request.getHeader("Range");
        if (rangeHeader != null && rangeHeader.startsWith("bytes=")) {
            long[] range = parseRange(rangeHeader, total);
            if (range == null) {
                // Node 端 send 的不满足错误也被 catch 成 404
                response.setStatus(HttpServletResponse.SC_NOT_FOUND);
                response.setContentLength(0);
                return;
            }
            int start = (int) range[0];
            int end = (int) range[1];
            response.setStatus(HttpServletResponse.SC_PARTIAL_CONTENT);
            response.setHeader("Content-Range", "bytes " + start + "-" + end + "/" + total);
            response.setContentLength(end - start + 1);
            if (!"HEAD".equals(request.getMethod())) {
                response.getOutputStream().write(content, start, end - start + 1);
            }
            return;
        }

        response.setStatus(HttpServletResponse.SC_OK);
        response.setContentLength(content.length);
        if (!"HEAD".equals(request.getMethod())) {
            response.getOutputStream().write(content);
        }
    }

    private static void notFound(HttpServletResponse response) {
        response.setStatus(HttpServletResponse.SC_NOT_FOUND);
        response.setContentLength(0);
    }

    /** 等价 Node 端 mime-types 查表：未知后缀不设置 Content-Type。 */
    private static String contentTypeOf(String filename) {
        int dot = filename.lastIndexOf('.');
        if (dot < 0 || dot == filename.length() - 1) {
            return null;
        }
        return MIME.get(filename.substring(dot + 1).toLowerCase(Locale.ROOT));
    }

    /** 解析单段 Range，返回 [start, end]；不可满足返回 null。 */
    private static long[] parseRange(String header, long total) {
        String spec = header.substring("bytes=".length()).trim();
        if (spec.contains(",")) {
            return null;
        }
        int dash = spec.indexOf('-');
        if (dash < 0 || total == 0) {
            return null;
        }
        String startText = spec.substring(0, dash).trim();
        String endText = spec.substring(dash + 1).trim();
        try {
            long start;
            long end;
            if (startText.isEmpty()) {
                if (endText.isEmpty()) {
                    return null;
                }
                long suffix = Long.parseLong(endText);
                if (suffix == 0) {
                    return null;
                }
                start = Math.max(0, total - suffix);
                end = total - 1;
            } else {
                start = Long.parseLong(startText);
                end = endText.isEmpty() ? total - 1 : Long.parseLong(endText);
            }
            if (start > end || start >= total) {
                return null;
            }
            return new long[]{start, Math.min(end, total - 1)};
        } catch (NumberFormatException error) {
            return null;
        }
    }

    /**
     * 等价 JS 的 decodeURIComponent（不解码 '+'，非法百分号序列按原样保留）。
     * Node 的 decodeURIComponent 对畸形序列会抛错并被 catch 成 404，此处按 U+FFFD 解码后同样落空。
     */
    private static String decode(String value) {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream(value.length());
        StringBuilder octets = new StringBuilder();
        int i = 0;
        while (i < value.length()) {
            char c = value.charAt(i);
            if (c == '%' && i + 2 < value.length()
                    && isHex(value.charAt(i + 1)) && isHex(value.charAt(i + 2))) {
                octets.append((char) Integer.parseInt(value.substring(i + 1, i + 3), 16));
                i += 3;
                continue;
            }
            // 非百分号转义：JS 会把 BMP 之外的字符按 UTF-8 编码，此处按 UTF-8 写出
            for (byte b : String.valueOf(c).getBytes(StandardCharsets.UTF_8)) {
                octets.append((char) (b & 0xFF));
            }
            i++;
        }
        for (int k = 0; k < octets.length(); k++) {
            bytes.write((byte) octets.charAt(k));
        }
        return Utf8Js.decode(bytes.toByteArray());
    }

    private static boolean isHex(char c) {
        return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
    }
}
