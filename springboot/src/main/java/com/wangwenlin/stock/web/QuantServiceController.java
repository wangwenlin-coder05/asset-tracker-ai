package com.wangwenlin.stock.web;

import com.wangwenlin.stock.service.QuantServiceManager;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 量化服务启停控制。对齐 Node 端 server.js 1254-1305：
 * GET /api/quant-service/status、POST /api/quant-service/start、POST /api/quant-service/stop。
 */
@RestController
public class QuantServiceController {

    private final QuantServiceManager manager;

    public QuantServiceController(QuantServiceManager manager) {
        this.manager = manager;
    }

    @GetMapping("/api/quant-service/status")
    public Map<String, Object> status() {
        return manager.status();
    }

    @PostMapping("/api/quant-service/start")
    public Map<String, Object> start() {
        return manager.start();
    }

    @PostMapping("/api/quant-service/stop")
    public Map<String, Object> stop() {
        return manager.stop();
    }
}
