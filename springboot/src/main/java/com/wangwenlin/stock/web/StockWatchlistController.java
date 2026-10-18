package com.wangwenlin.stock.web;

import com.wangwenlin.stock.service.StockWatchlistService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * /api/stock/watchlist 路由（6 个）—— 路径与 Node 端一一对应。
 */
@RestController
@RequestMapping("/api/stock/watchlist")
public class StockWatchlistController {

    private final StockWatchlistService watchlistService;

    public StockWatchlistController(StockWatchlistService watchlistService) {
        this.watchlistService = watchlistService;
    }

    @GetMapping
    public List<Map<String, Object>> list() {
        return watchlistService.list();
    }

    @PostMapping
    public Map<String, Object> create(@RequestBody(required = false) Map<String, Object> body) {
        return watchlistService.create(body(body));
    }

    @PutMapping("/{id}")
    public Map<String, Object> update(@PathVariable("id") String id,
                                      @RequestBody(required = false) Map<String, Object> body) {
        return watchlistService.update(id, body(body));
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable("id") String id) {
        return watchlistService.delete(id);
    }

    @PutMapping("/{id}/analysis")
    public Map<String, Object> saveAnalysis(@PathVariable("id") String id,
                                            @RequestBody(required = false) Map<String, Object> body) {
        return watchlistService.saveAnalysis(id, body(body));
    }

    @DeleteMapping("/{id}/analysis/{date}")
    public Map<String, Object> deleteAnalysis(@PathVariable("id") String id,
                                              @PathVariable("date") String date) {
        return watchlistService.deleteAnalysis(id, date);
    }

    private static Map<String, Object> body(Map<String, Object> body) {
        return body == null ? Map.of() : body;
    }
}
