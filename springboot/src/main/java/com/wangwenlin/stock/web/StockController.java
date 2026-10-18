package com.wangwenlin.stock.web;

import com.wangwenlin.stock.service.StockService;
import com.wangwenlin.stock.web.dto.BuyRecordDto;
import com.wangwenlin.stock.web.dto.SellRecordDto;
import com.wangwenlin.stock.web.dto.StockDto;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * /api/stocks 模块路由 —— 路径与 Node 端逐一对应，保证按前缀分流时前端零改动。
 */
@RestController
@RequestMapping("/api/stocks")
public class StockController {

    private final StockService stockService;

    public StockController(StockService stockService) {
        this.stockService = stockService;
    }

    @GetMapping
    public List<StockDto> list(@RequestParam(value = "board", required = false) String board) {
        return stockService.listStocks(board);
    }

    @PostMapping
    public Map<String, Object> create(@RequestBody(required = false) Map<String, Object> body) {
        return stockService.createStock(body(body));
    }

    // 交易记录日志：必须在 /{id} 之前保证字面量优先（Spring 会按精确度自动择优选字面量路由）
    @PostMapping("/tx-log")
    public Map<String, Object> createTxLog(@RequestBody(required = false) Map<String, Object> body) {
        return stockService.createTxLog(body(body));
    }

    @GetMapping("/tx-logs")
    public Map<String, Object> txLogs(@RequestParam(value = "limit", required = false) String limit,
                                      @RequestParam(value = "offset", required = false) String offset) {
        return stockService.listTxLogs(limit, offset);
    }

    @GetMapping("/{id}")
    public StockDto get(@PathVariable("id") String id) {
        return stockService.getStock(id);
    }

    @PutMapping("/{id}")
    public Map<String, Object> update(@PathVariable("id") String id,
                                      @RequestBody(required = false) Map<String, Object> body) {
        return stockService.updateStock(id, body(body));
    }

    @PutMapping("/{id}/clear")
    public Map<String, Object> clear(@PathVariable("id") String id) {
        return stockService.clearStock(id);
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable("id") String id) {
        return stockService.deleteStock(id);
    }

    @GetMapping("/{id}/sell-records")
    public List<SellRecordDto> sellRecords(@PathVariable("id") String id) {
        return stockService.listSellRecordDtos(id);
    }

    @PostMapping("/{id}/sell-record")
    public Map<String, Object> createSellRecord(@PathVariable("id") String id,
                                                @RequestBody(required = false) Map<String, Object> body) {
        return stockService.createSellRecord(id, body(body));
    }

    @PutMapping("/{id}/sell-record/{recordId}")
    public Map<String, Object> updateSellRecord(@PathVariable("id") String id,
                                                @PathVariable("recordId") String recordId,
                                                @RequestBody(required = false) Map<String, Object> body) {
        return stockService.updateSellRecord(id, recordId, body(body));
    }

    @DeleteMapping("/{id}/sell-record/{recordId}")
    public Map<String, Object> deleteSellRecord(@PathVariable("id") String id,
                                                @PathVariable("recordId") String recordId) {
        return stockService.deleteSellRecord(id, recordId);
    }

    @GetMapping("/{id}/buy-records")
    public List<BuyRecordDto> buyRecords(@PathVariable("id") String id) {
        return stockService.listBuyRecordDtos(id);
    }

    @PostMapping("/{id}/buy-record")
    public Map<String, Object> createBuyRecord(@PathVariable("id") String id,
                                               @RequestBody(required = false) Map<String, Object> body) {
        return stockService.createBuyRecord(id, body(body));
    }

    @PutMapping("/{id}/buy-record/{recordId}")
    public Map<String, Object> updateBuyRecord(@PathVariable("id") String id,
                                               @PathVariable("recordId") String recordId,
                                               @RequestBody(required = false) Map<String, Object> body) {
        return stockService.updateBuyRecord(id, recordId, body(body));
    }

    @DeleteMapping("/{id}/buy-record/{recordId}")
    public Map<String, Object> deleteBuyRecord(@PathVariable("id") String id,
                                               @PathVariable("recordId") String recordId) {
        return stockService.deleteBuyRecord(id, recordId);
    }

    private static Map<String, Object> body(Map<String, Object> body) {
        return body == null ? Map.of() : body;
    }
}
