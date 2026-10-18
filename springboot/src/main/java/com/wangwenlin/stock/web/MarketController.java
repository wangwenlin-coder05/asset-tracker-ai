package com.wangwenlin.stock.web;

import com.wangwenlin.stock.service.IpoCalendarService;
import com.wangwenlin.stock.service.MarketOverviewService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 大盘 / 打新日历路由 —— 路径与 Node 端 server.js 一一对应，故不设类级前缀。
 */
@RestController
public class MarketController {

    private final MarketOverviewService marketOverviewService;
    private final IpoCalendarService ipoCalendarService;

    public MarketController(MarketOverviewService marketOverviewService, IpoCalendarService ipoCalendarService) {
        this.marketOverviewService = marketOverviewService;
        this.ipoCalendarService = ipoCalendarService;
    }

    /** 等价 Node 端 res.json({ data })。 */
    @GetMapping("/api/market/overview")
    public Map<String, Object> overview() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("data", marketOverviewService.overview());
        return result;
    }

    @GetMapping("/api/newstock-calendar")
    public Map<String, Object> newstockCalendar() {
        return ipoCalendarService.calendar();
    }
}
