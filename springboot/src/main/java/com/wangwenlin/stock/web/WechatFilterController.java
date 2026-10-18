package com.wangwenlin.stock.web;

import com.wangwenlin.stock.service.WechatFilterService;
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
 * 微信黑名单 / 白名单 / 会话跳过规则 / 白名单汇总 / 自定义行情分析。
 * 逐行对齐 server.js 3458-3745。注：db/clear 与 tracking 删除路由分属此处与 WechatTrackingController。
 */
@RestController
@RequestMapping("/api/wechat")
public class WechatFilterController {

    private final WechatFilterService filterService;

    public WechatFilterController(WechatFilterService filterService) {
        this.filterService = filterService;
    }

    // ==================== DELETE /api/wechat/db/clear ====================

    @DeleteMapping("/db/clear")
    public Map<String, Object> clearDb() {
        return filterService.clearDb();
    }

    // ==================== 黑名单 ====================

    @GetMapping("/blacklist")
    public List<Map<String, Object>> listBlacklist() {
        return filterService.listBlacklist();
    }

    @PostMapping("/blacklist")
    public Map<String, Object> addBlacklist(@RequestBody(required = false) Map<String, Object> body) {
        return filterService.addBlacklist(body);
    }

    @DeleteMapping("/blacklist/{id}")
    public Map<String, Object> deleteBlacklist(@PathVariable("id") String id) {
        return filterService.deleteBlacklist(id);
    }

    @PutMapping("/blacklist/{id}")
    public Map<String, Object> updateBlacklist(@PathVariable("id") String id,
                                               @RequestBody(required = false) Map<String, Object> body) {
        return filterService.updateBlacklist(id, body);
    }

    // ==================== GET /api/wechat/session-skip-rules ====================

    @GetMapping("/session-skip-rules")
    public Map<String, Object> sessionSkipRules() {
        return filterService.sessionSkipRules();
    }

    // ==================== 白名单 ====================

    @GetMapping("/whitelist")
    public List<Map<String, Object>> listWhitelist() {
        return filterService.listWhitelist();
    }

    @PostMapping("/whitelist")
    public Map<String, Object> addWhitelist(@RequestBody(required = false) Map<String, Object> body) {
        return filterService.addWhitelist(body);
    }

    @DeleteMapping("/whitelist/{id}")
    public Map<String, Object> deleteWhitelist(@PathVariable("id") String id) {
        return filterService.deleteWhitelist(id);
    }

    @PutMapping("/whitelist/{id}")
    public Map<String, Object> updateWhitelist(@PathVariable("id") String id,
                                               @RequestBody(required = false) Map<String, Object> body) {
        return filterService.updateWhitelist(id, body);
    }

    // ==================== POST /api/wechat/whitelist/summarize ====================

    @PostMapping("/whitelist/summarize")
    public Map<String, Object> summarize(@RequestBody(required = false) Map<String, Object> body) throws Exception {
        return filterService.summarize(body);
    }

    // ==================== POST /api/wechat/ai/market-analysis ====================

    @PostMapping("/ai/market-analysis")
    public Map<String, Object> marketAnalysis(@RequestBody(required = false) Map<String, Object> body) throws Exception {
        return filterService.marketAnalysis(body);
    }
}
