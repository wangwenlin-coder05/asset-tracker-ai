package com.wangwenlin.stock.web;

import com.wangwenlin.stock.service.DailyTaskService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * /api/daily-tasks 路由（5 个）—— 路径与 Node 端 backend/daily-tasks.js 一一对应。
 */
@RestController
@RequestMapping("/api/daily-tasks")
public class DailyTaskController {

    private final DailyTaskService taskService;

    public DailyTaskController(DailyTaskService taskService) {
        this.taskService = taskService;
    }

    @GetMapping
    public Map<String, Object> list(@RequestParam(value = "date", required = false) String date) {
        return taskService.list(date);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> create(@RequestBody(required = false) Map<String, Object> body) {
        return taskService.create(body(body));
    }

    @PutMapping("/{id}")
    public Map<String, Object> update(@PathVariable("id") String id,
                                      @RequestBody(required = false) Map<String, Object> body) {
        return taskService.update(id, body(body));
    }

    @PutMapping("/{id}/state")
    public Map<String, Object> updateState(@PathVariable("id") String id,
                                           @RequestBody(required = false) Map<String, Object> body) {
        return taskService.updateState(id, body(body));
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable("id") String id) {
        return taskService.delete(id);
    }

    private static Map<String, Object> body(Map<String, Object> body) {
        return body == null ? Map.of() : body;
    }
}
