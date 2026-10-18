package com.wangwenlin.stock.web;

import com.wangwenlin.stock.service.LifeGraphService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 人生规划器「规划图与重置」路由。逐行对齐 server.js 8881-9095 的 8 条路由。
 */
@RestController
@RequestMapping("/api/life")
public class LifeGraphController {

    private final LifeGraphService graphService;

    public LifeGraphController(LifeGraphService graphService) {
        this.graphService = graphService;
    }

    // ==================== POST /api/life/plan/nodes ====================

    @PostMapping("/plan/nodes")
    public Map<String, Object> addNode(@RequestBody(required = false) Map<String, Object> body) {
        return graphService.addNode(body);
    }

    // ==================== PUT /api/life/plan/nodes/:id ====================

    @PutMapping("/plan/nodes/{id}")
    public Map<String, Object> updateNode(@PathVariable("id") String id,
                                          @RequestBody(required = false) Map<String, Object> body) {
        return graphService.updateNode(id, body);
    }

    // ==================== DELETE /api/life/plan/nodes/:id ====================

    @DeleteMapping("/plan/nodes/{id}")
    public Map<String, Object> deleteNode(@PathVariable("id") String id) {
        return graphService.deleteNode(id);
    }

    // ==================== DELETE /api/life/plan ====================

    @DeleteMapping("/plan")
    public Map<String, Object> resetPlan() {
        return graphService.resetPlan();
    }

    // ==================== GET /api/life/plan/rejects ====================

    @GetMapping("/plan/rejects")
    public Map<String, Object> listRejects() {
        return graphService.listRejects();
    }

    // ==================== DELETE /api/life/plan/rejects ====================

    @DeleteMapping("/plan/rejects")
    public Map<String, Object> restoreReject(@RequestBody(required = false) Map<String, Object> body) {
        return graphService.restoreReject(body);
    }

    // ==================== DELETE /api/life/chat ====================

    @DeleteMapping("/chat")
    public Map<String, Object> clearChat() {
        return graphService.clearChat();
    }

    // ==================== DELETE /api/life/data ====================

    @DeleteMapping("/data")
    public Map<String, Object> resetAll() {
        return graphService.resetAll();
    }
}
