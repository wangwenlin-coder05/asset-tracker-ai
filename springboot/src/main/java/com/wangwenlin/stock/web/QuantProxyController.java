package com.wangwenlin.stock.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.Enumeration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 量化回测引擎代理。逐条对齐 Node 端 server.js:1159-1205 的 {@code quantProxy}：
 * 把 {@code /quant/**} 与 {@code /api/quant/**} 转发到独立 Python quant 服务（FastAPI），
 * 并把入径前缀 {@code ^/(?:api/)?quant\b} 重写为 {@code /api}。
 *
 * <p>Node 端只做端口转发，业务逻辑全在 Python 侧，因此这里也只做转发，不解析响应体。
 */
@RestController
public class QuantProxyController {

    /** 对齐 Node 端 {@code /^\/(?:api\/)?quant\b/}。 */
    private static final Pattern QUANT_PREFIX = Pattern.compile("^/(?:api/)?quant\\b");
    private static final String UNAVAILABLE_ERROR = "量化服务未启动（python quant/ 目录下运行 uvicorn quant.api:app --port 8000）";
    private static final String TIMEOUT_ERROR = "quant 服务超时";
    /** Node 端透传请求头时显式删除的三项（不回传给 Python）。 */
    private static final Set<String> DROPPED_HEADERS = Set.of("cookie", "authorization", "x-csrf-token");
    /** JDK HttpClient 禁止设置的头（设置会抛 IllegalArgumentException），透传时跳过；host 由 URI 自动带上。 */
    private static final Set<String> RESTRICTED_HEADERS = Set.of(
            "connection", "content-length", "expect", "host", "upgrade",
            "transfer-encoding", "keep-alive", "proxy-connection", "te", "trailer");

    private final String target;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    public QuantProxyController(@Value("${QUANT_SERVICE_URL:http://localhost:8000}") String target,
                                ObjectMapper objectMapper) {
        this.target = target;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    @RequestMapping({"/quant", "/quant/**", "/api/quant", "/api/quant/**"})
    public void proxy(HttpServletRequest request, HttpServletResponse response) throws IOException {
        String uri = request.getRequestURI();
        Matcher matcher = QUANT_PREFIX.matcher(uri);
        String rewritten = matcher.find() ? matcher.replaceFirst("/api") : uri;
        String query = request.getQueryString();
        String url = query == null || query.isEmpty() ? target + rewritten : target + rewritten + "?" + query;

        // 对齐 Node：仅 POST/PUT/PATCH 且有 body 时转发，并一律按 application/json 发出
        boolean mayHaveBody = "POST".equals(request.getMethod())
                || "PUT".equals(request.getMethod())
                || "PATCH".equals(request.getMethod());
        byte[] body = mayHaveBody ? request.getInputStream().readAllBytes() : new byte[0];

        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(120));
        Enumeration<String> names = request.getHeaderNames();
        while (names != null && names.hasMoreElements()) {
            String name = names.nextElement();
            String lower = name.toLowerCase();
            if (DROPPED_HEADERS.contains(lower) || RESTRICTED_HEADERS.contains(lower)) {
                continue;
            }
            String value = request.getHeader(name);
            if (value != null) {
                builder.setHeader(name, value);
            }
        }
        if (body.length > 0) {
            builder.setHeader("content-type", "application/json");
            builder.method(request.getMethod(), HttpRequest.BodyPublishers.ofByteArray(body));
        } else {
            builder.method(request.getMethod(), HttpRequest.BodyPublishers.noBody());
        }

        HttpResponse<InputStream> upstream;
        try {
            upstream = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream());
        } catch (HttpTimeoutException timeout) {
            writeUnavailable(response, TIMEOUT_ERROR);
            return;
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            writeUnavailable(response, TIMEOUT_ERROR);
            return;
        } catch (IOException failure) {
            writeUnavailable(response, detailOf(failure));
            return;
        }

        response.setStatus(upstream.statusCode());
        // 对齐 Node：只回吐上游的 Content-Type（缺省 application/json），其余一律不透传
        response.setHeader("Content-Type", upstream.headers().firstValue("content-type").orElse("application/json"));
        try (InputStream input = upstream.body(); OutputStream output = response.getOutputStream()) {
            input.transferTo(output);
        }
    }

    /**
     * 对齐 Node 端 proxyReq.on('error') 里回吐的 {@code err.message}。
     * 默认目标 {@code http://localhost:8000} 会被 Node 双栈解析，连接被拒时抛的是 message 为空的
     * AggregateError，因此这里对连接类错误统一回空串，保持前端「detail || e.message」的取值行为一致。
     */
    private static String detailOf(IOException failure) {
        Throwable cause = failure.getCause() == null ? failure : failure.getCause();
        if (failure instanceof java.net.ConnectException || cause instanceof java.net.ConnectException) {
            return "";
        }
        String message = failure.getMessage();
        return message == null ? "" : message;
    }

    /** 对齐 Node 端 proxyReq.on('error')：502 + { success:false, error, detail }。 */
    private void writeUnavailable(HttpServletResponse response, String detail) throws IOException {
        if (response.isCommitted()) {
            response.getOutputStream().close();
            return;
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("success", false);
        payload.put("error", UNAVAILABLE_ERROR);
        payload.put("detail", detail);
        byte[] bytes = objectMapper.writeValueAsBytes(payload);
        response.setStatus(HttpServletResponse.SC_BAD_GATEWAY);
        // 对齐 Express 的 res.json()：Content-Type 为 application/json; charset=utf-8
        response.setContentType("application/json; charset=utf-8");
        response.setContentLength(bytes.length);
        response.getOutputStream().write(bytes);
    }
}
