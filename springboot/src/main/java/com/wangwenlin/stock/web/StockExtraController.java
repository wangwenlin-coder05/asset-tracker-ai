package com.wangwenlin.stock.web;

import com.wangwenlin.stock.service.StockExtraService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 股票杂项路由（9 个）—— 路径与 Node 端 server.js 一一对应，故不设类级前缀。
 */
@RestController
public class StockExtraController {

    private final StockExtraService stockExtraService;

    public StockExtraController(StockExtraService stockExtraService) {
        this.stockExtraService = stockExtraService;
    }

    @GetMapping("/api/stock/news/{code}")
    public Map<String, Object> news(@PathVariable("code") String code) {
        return stockExtraService.news(code);
    }

    @GetMapping("/api/stock/sentiment/{code}")
    public Map<String, Object> sentiment(@PathVariable("code") String code) {
        return stockExtraService.sentiment(code);
    }

    @PostMapping("/api/stock/daily-changes")
    public Map<String, Object> dailyChanges(@RequestBody(required = false) Map<String, Object> body) {
        return stockExtraService.dailyChanges(body == null ? Map.of() : body);
    }

    @GetMapping("/api/stock/ipo-market-value")
    public Map<String, Object> ipoMarketValue() {
        return stockExtraService.ipoMarketValue();
    }

    @GetMapping("/api/stock/daily-summary")
    public Map<String, Object> getDailySummary(@RequestParam(value = "date", required = false) String date) {
        return stockExtraService.getDailySummary(date);
    }

    @PutMapping("/api/stock/daily-summary")
    public Map<String, Object> saveDailySummary(@RequestBody(required = false) Map<String, Object> body) {
        return stockExtraService.saveDailySummary(body == null ? Map.of() : body);
    }

    @GetMapping("/api/stock-price")
    public Map<String, Object> stockPrice(@RequestParam(value = "codes", required = false) String codes) {
        return stockExtraService.stockPrice(codes);
    }

    @GetMapping("/api/stock/name/{code}")
    public Map<String, Object> stockName(@PathVariable("code") String code) {
        return stockExtraService.stockName(code);
    }

    @GetMapping("/api/stock/search")
    public Map<String, Object> search(@RequestParam(value = "name", required = false) String name) {
        return stockExtraService.searchByName(name);
    }
}
