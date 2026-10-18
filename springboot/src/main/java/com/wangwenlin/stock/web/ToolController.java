package com.wangwenlin.stock.web;

import com.wangwenlin.stock.service.ToolService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 小工具收藏接口。对齐 Node 端 server.js 5541-5638：
 * GET /api/tools/categories、GET /api/tools、POST /api/tools、PUT/DELETE /api/tools/:id、
 * POST /api/tools/reorder。
 */
@RestController
public class ToolController {

    private final ToolService service;

    public ToolController(ToolService service) {
        this.service = service;
    }

    @GetMapping("/api/tools/categories")
    public List<String> categories() {
        return service.categories();
    }

    @GetMapping("/api/tools")
    public List<Map<String, Object>> list() {
        return service.list();
    }

    @PostMapping("/api/tools")
    public Map<String, Object> create(@RequestBody(required = false) Object body) {
        return service.create(body);
    }

    @PostMapping("/api/tools/reorder")
    public Map<String, Object> reorder(@RequestBody(required = false) Object body) {
        return service.reorder(body);
    }

    @PutMapping("/api/tools/{id}")
    public Map<String, Object> update(@PathVariable("id") String id, @RequestBody(required = false) Object body) {
        return service.update(id, body);
    }

    @DeleteMapping("/api/tools/{id}")
    public Map<String, Object> remove(@PathVariable("id") String id) {
        return service.remove(id);
    }
}
