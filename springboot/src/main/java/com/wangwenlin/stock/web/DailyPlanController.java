package com.wangwenlin.stock.web;

import com.wangwenlin.stock.service.DailyPlanService;
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
 * /api/plans 路由（7 个）—— 路径与 Node 端一一对应。
 */
@RestController
@RequestMapping("/api/plans")
public class DailyPlanController {

    private final DailyPlanService planService;

    public DailyPlanController(DailyPlanService planService) {
        this.planService = planService;
    }

    @GetMapping
    public List<Map<String, Object>> list() {
        return planService.list();
    }

    @PostMapping
    public Map<String, Object> create(@RequestBody(required = false) Map<String, Object> body) {
        return planService.create(body(body));
    }

    @PutMapping("/{id}")
    public Map<String, Object> update(@PathVariable("id") String id,
                                      @RequestBody(required = false) Map<String, Object> body) {
        return planService.update(id, body(body));
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable("id") String id) {
        return planService.delete(id);
    }

    @GetMapping("/completions/{date}")
    public Map<String, Object> completions(@PathVariable("date") String date) {
        return planService.completions(date);
    }

    @PostMapping("/{id}/toggle")
    public Map<String, Object> toggle(@PathVariable("id") String id,
                                      @RequestBody(required = false) Map<String, Object> body) {
        return planService.toggle(id, body(body));
    }

    @PostMapping("/reorder")
    public Map<String, Object> reorder(@RequestBody(required = false) Map<String, Object> body) {
        return planService.reorder(body(body));
    }

    private static Map<String, Object> body(Map<String, Object> body) {
        return body == null ? Map.of() : body;
    }
}
