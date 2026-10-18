package com.wangwenlin.stock.web;

import com.wangwenlin.stock.service.GoldPriceService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 国际金价。对齐 Node 端 server.js 10993：?force=1 / ?force=true 跳过 60 秒缓存。
 */
@RestController
public class GoldPriceController {

    private final GoldPriceService goldPriceService;

    public GoldPriceController(GoldPriceService goldPriceService) {
        this.goldPriceService = goldPriceService;
    }

    @GetMapping("/api/gold-price")
    public Map<String, Object> goldPrice(@RequestParam(value = "force", required = false) String force) {
        return goldPriceService.price("1".equals(force) || "true".equals(force));
    }
}
