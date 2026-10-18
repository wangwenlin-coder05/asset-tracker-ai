package com.wangwenlin.stock.common;

import java.util.Map;

/**
 * 业务异常：携带 HTTP 状态码与对前端可见的错误文案。
 * 对齐 Node 端 res.status(code).json({ error }) 的返回形式。
 */
public class ApiException extends RuntimeException {

    private final int status;

    /** 自定义响应体。为 null 时统一回落为 Node 端默认的 { error }。 */
    private final Map<String, Object> body;

    public ApiException(int status, String message) {
        this(status, message, null);
    }

    public ApiException(int status, String message, Map<String, Object> body) {
        super(message);
        this.status = status;
        this.body = body;
    }

    public int getStatus() {
        return status;
    }

    public Map<String, Object> getBody() {
        return body;
    }

    public static ApiException badRequest(String message) {
        return new ApiException(400, message);
    }

    public static ApiException unauthorized(String message) {
        return new ApiException(401, message);
    }

    public static ApiException forbidden(String message) {
        return new ApiException(403, message);
    }

    public static ApiException notFound(String message) {
        return new ApiException(404, message);
    }

    public static ApiException conflict(String message) {
        return new ApiException(409, message);
    }
}
