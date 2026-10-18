package com.wangwenlin.stock.web;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 迁移期自检端点（不占用 /api 命名空间，仅本机调试用）。
 */
@RestController
public class HealthController {

    private final JdbcTemplate jdbcTemplate;

    public HealthController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /** 对齐 Node 端 server.js:96 的 {@code app.get('/healthz', ... res.json({ ok: true }))}。 */
    @GetMapping("/healthz")
    public Map<String, Object> healthz() {
        Map<String, Object> result = new LinkedHashMap<>(1);
        result.put("ok", true);
        return result;
    }

    /** 对齐 Node 端 server.js:98 的 {@code app.get('/favicon.ico', ... res.status(204).end())}。 */
    @GetMapping("/favicon.ico")
    public void favicon(HttpServletResponse response) {
        response.setStatus(HttpStatus.NO_CONTENT.value());
    }

    @GetMapping("/internal/health")
    public Map<String, Object> health() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("app", "stock-springboot");
        result.put("status", "UP");
        try {
            Integer one = jdbcTemplate.queryForObject("SELECT 1", Integer.class);
            result.put("db", one != null && one == 1 ? "UP" : "DOWN");
        } catch (Exception e) {
            result.put("db", "DOWN");
            result.put("dbError", e.getMessage());
        }
        return result;
    }
}
