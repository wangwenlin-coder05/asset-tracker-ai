package com.wangwenlin.stock.web;

import com.wangwenlin.stock.service.LifeDomainService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 人生规划器「领域数据 CRUD」子集路由。逐行对齐 server.js 9373-10216 的 26 条路由。
 */
@RestController
@RequestMapping("/api/life")
public class LifeDomainController {

    private final LifeDomainService service;

    public LifeDomainController(LifeDomainService service) {
        this.service = service;
    }

    // ==================== 每日任务 ====================

    @GetMapping("/tasks")
    public Map<String, Object> listTasks(@RequestParam(value = "date", required = false) String date,
                                         @RequestParam(value = "from", required = false) String from,
                                         @RequestParam(value = "to", required = false) String to) {
        return service.listTasks(date, from, to);
    }

    @PostMapping("/tasks")
    public Map<String, Object> createTask(@RequestBody(required = false) Map<String, Object> body) {
        return service.createTask(body);
    }

    @PutMapping("/tasks/{id}")
    public Map<String, Object> updateTask(@PathVariable("id") String id,
                                          @RequestBody(required = false) Map<String, Object> body) {
        return service.updateTask(id, body);
    }

    @PostMapping("/tasks/{id}/state")
    public Map<String, Object> updateTaskState(@PathVariable("id") String id,
                                               @RequestBody(required = false) Map<String, Object> body) {
        return service.updateTaskState(id, body);
    }

    @DeleteMapping("/tasks/{id}")
    public Map<String, Object> deleteTask(@PathVariable("id") String id) {
        return service.deleteTask(id);
    }

    // ==================== 进度快照 ====================

    @GetMapping("/snapshots")
    public Map<String, Object> listSnapshots() {
        return service.listSnapshots();
    }

    @PostMapping("/snapshots")
    public Map<String, Object> createSnapshot(@RequestBody(required = false) Map<String, Object> body) {
        return service.createSnapshot(body);
    }

    @GetMapping("/snapshots/{id}")
    public Map<String, Object> getSnapshot(@PathVariable("id") String id) {
        return service.getSnapshot(id);
    }

    @PostMapping("/snapshots/{id}/restore")
    public Map<String, Object> restoreSnapshot(@PathVariable("id") String id) {
        return service.restoreSnapshot(id);
    }

    // ==================== 精力负荷 ====================

    @GetMapping("/energy")
    public Map<String, Object> listEnergy() {
        return service.listEnergy();
    }

    @PostMapping("/energy")
    public Map<String, Object> saveEnergy(@RequestBody(required = false) Map<String, Object> body) {
        return service.saveEnergy(body);
    }

    // ==================== 技能档案 ====================

    @GetMapping("/skills")
    public Map<String, Object> listSkills() {
        return service.listSkills();
    }

    @PostMapping("/skills")
    public Map<String, Object> createSkill(@RequestBody(required = false) Map<String, Object> body) {
        return service.createSkill(body);
    }

    @PutMapping("/skills/{id}")
    public Map<String, Object> updateSkill(@PathVariable("id") String id,
                                           @RequestBody(required = false) Map<String, Object> body) {
        return service.updateSkill(id, body);
    }

    @DeleteMapping("/skills/{id}")
    public Map<String, Object> deleteSkill(@PathVariable("id") String id) {
        return service.deleteSkill(id);
    }

    // ==================== 学习知识库 ====================

    @GetMapping("/knowledge")
    public Map<String, Object> listKnowledge() {
        return service.listKnowledge();
    }

    @PostMapping("/knowledge")
    public Map<String, Object> createKnowledge(@RequestBody(required = false) Map<String, Object> body) {
        return service.createKnowledge(body);
    }

    @PutMapping("/knowledge/{id}")
    public Map<String, Object> updateKnowledge(@PathVariable("id") String id,
                                               @RequestBody(required = false) Map<String, Object> body) {
        return service.updateKnowledge(id, body);
    }

    @DeleteMapping("/knowledge/{id}")
    public Map<String, Object> deleteKnowledge(@PathVariable("id") String id) {
        return service.deleteKnowledge(id);
    }

    @PostMapping("/knowledge/{id}/review")
    public Map<String, Object> reviewKnowledge(@PathVariable("id") String id) {
        return service.reviewKnowledge(id);
    }

    // ==================== 外部事件日历 ====================

    @GetMapping("/events")
    public Map<String, Object> listEvents() {
        return service.listEvents();
    }

    @PostMapping("/events")
    public Map<String, Object> createEvent(@RequestBody(required = false) Map<String, Object> body) {
        return service.createEvent(body);
    }

    @PutMapping("/events/{id}")
    public Map<String, Object> updateEvent(@PathVariable("id") String id,
                                           @RequestBody(required = false) Map<String, Object> body) {
        return service.updateEvent(id, body);
    }

    @DeleteMapping("/events/{id}")
    public Map<String, Object> deleteEvent(@PathVariable("id") String id) {
        return service.deleteEvent(id);
    }

    // ==================== 变更日志 / 重点提醒 ====================

    @GetMapping("/changes")
    public Map<String, Object> listChanges() {
        return service.listChanges();
    }

    @GetMapping("/alerts")
    public Map<String, Object> listAlerts() {
        return service.listAlerts();
    }
}
