package com.wangwenlin.stock.common;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 全局异常处理。保持与 Node 端一致的 { error: '...' } 结构，避免前端 401 重载 / 文案解析行为改变。
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);
    /** 会话失效类文案：必须保持 401，前端据此整页重载。 */
    private static final Pattern SESSION_LOST = Pattern.compile("登录已失效|请先登录");

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, Object>> handleApi(ApiException ex) {
        Map<String, Object> custom = ex.getBody();
        return ResponseEntity.status(ex.getStatus()).body(custom == null ? body(ex.getMessage()) : custom);
    }

    @ExceptionHandler(NoHandlerFoundException.class)
    public ResponseEntity<Map<String, Object>> handleNotFound() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(body("接口不存在"));
    }

    /**
     * 静态资源未命中（前端产物之外的非 /api 路径）。Node 端由 express 兜底回 404，
     * Spring 6.1 起改抛 NoResourceFoundException，不显式处理会落进下面的兜底变成 500。
     */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Void> handleNoResource() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
    }

    /**
     * Express 未匹配到「路径 + 方法」组合时统一走 404，从不存在 405 ——
     * 故此处把方法不符也收敛成与 Node 完全一致的 404「接口不存在」。
     */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<Map<String, Object>> handleMethod(HttpRequestMethodNotSupportedException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(body("接口不存在"));
    }

    @ExceptionHandler({MissingServletRequestParameterException.class, MethodArgumentTypeMismatchException.class})
    public ResponseEntity<Map<String, Object>> handleBadRequest(Exception ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body(ex.getMessage()));
    }

    /**
     * 超限上传对齐 multer 的 LIMIT_FILE_SIZE：
     * 一般上传（回调式处理）→ 400 +「File too large」；
     * 画板上传（错误直接落入 Express 全局兜底）→ 500 +「请求处理失败」。
     */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, Object>> handleUploadSize(HttpServletRequest request) {
        String uri = request.getRequestURI();
        if (uri != null && uri.startsWith("/api/board/")) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body("请求处理失败"));
        }
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body("File too large"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleAny(Exception ex, HttpServletRequest request) {
        Throwable root = rootCause(ex);
        String message = root.getMessage() == null ? ex.getClass().getSimpleName() : root.getMessage();
        if (SESSION_LOST.matcher(message).find()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(body(message));
        }
        log.error("接口异常 {} {}", request.getMethod(), request.getRequestURI(), ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body(message));
    }

    private static Throwable rootCause(Throwable ex) {
        Throwable current = ex;
        while (current.getCause() != null && current.getCause() != current) {
            current = current.getCause();
        }
        return current;
    }

    private static Map<String, Object> body(String message) {
        Map<String, Object> map = new LinkedHashMap<>(2);
        map.put("error", message == null ? "服务器内部错误" : message);
        return map;
    }
}
