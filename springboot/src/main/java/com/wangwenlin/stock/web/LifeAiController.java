package com.wangwenlin.stock.web;

import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.service.LifeAiService;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 人生规划器「AI 编排」子集。
 * 逐行对齐 server.js：GET /plan(8242)、GET /chat(8253)、POST /chat(8551)、
 * POST /chat/stream(8571)、POST /plan/extract(8628)、POST /plan/regenerate(8643)。
 */
@RestController
@RequestMapping("/api/life")
public class LifeAiController {

    private final LifeAiService service;

    public LifeAiController(LifeAiService service) {
        this.service = service;
    }

    @GetMapping("/plan")
    public Map<String, Object> getPlan() {
        try {
            return service.getPlan();
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw fail(error, "获取失败");
        }
    }

    @GetMapping("/chat")
    public Map<String, Object> getChat() {
        try {
            return service.getChat();
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw fail(error, "获取失败");
        }
    }

    @PostMapping("/chat")
    public Map<String, Object> chat(@RequestBody(required = false) Map<String, Object> body) {
        try {
            return service.chat(body);
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw fail(error, "AI 暂时不可用");
        }
    }

    @PostMapping("/chat/stream")
    public void chatStream(@RequestBody(required = false) Map<String, Object> body, HttpServletResponse response) {
        service.chatStream(body, response);
    }

    @PostMapping("/plan/extract")
    public Map<String, Object> extractPlan() {
        try {
            return service.extractPlan();
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw fail(error, "更新失败");
        }
    }

    @PostMapping("/plan/regenerate")
    public Map<String, Object> regenerate(@RequestBody(required = false) Map<String, Object> body) {
        try {
            return service.regenerate(body);
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw fail(error, "AI 暂时不可用");
        }
    }

    private static ApiException fail(Exception error, String fallback) {
        String message = error.getMessage();
        return new ApiException(500, message == null || message.isEmpty() ? fallback : message);
    }
}
