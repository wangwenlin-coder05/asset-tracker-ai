package com.wangwenlin.stock.web;

import com.wangwenlin.stock.service.ForexService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 汇率。对齐 Node 端 server.js 11385-11392。
 */
@RestController
public class ForexController {

    private final ForexService forexService;

    public ForexController(ForexService forexService) {
        this.forexService = forexService;
    }

    @GetMapping("/api/forex/rates")
    public Map<String, Object> rates() {
        Map<String, Object> data = forexService.fetchRates();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("savedAt", data.get("savedAt"));
        result.put("rates", data.get("rates"));
        return result;
    }
}
