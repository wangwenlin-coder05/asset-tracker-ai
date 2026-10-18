package com.wangwenlin.stock.web;

import com.wangwenlin.stock.service.WoolService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

/**
 * 薅羊毛 / 消费 API（14 个路由），与 Node 端 server.js 路径一一对应。
 * 注意：notes / calendar / daily / upload-image / recognize 均为字面量前缀，
 * 由 MVC 的路径匹配优先级保证优先于 /api/wool/{id}，与 Node 端的声明顺序要求等价。
 */
@RestController
public class WoolController {

    private final WoolService woolService;

    public WoolController(WoolService woolService) {
        this.woolService = woolService;
    }

    @GetMapping("/api/wool")
    public List<Map<String, Object>> list() {
        return woolService.list();
    }

    @PostMapping("/api/wool")
    public Map<String, Object> create(@RequestBody(required = false) Map<String, Object> body) {
        return woolService.create(body);
    }

    @GetMapping("/api/wool/notes")
    public List<Map<String, Object>> listNotes(@RequestParam(value = "type", required = false) String type) {
        return woolService.listNotes(type);
    }

    @PostMapping("/api/wool/notes")
    public Map<String, Object> createNote(@RequestBody(required = false) Map<String, Object> body) {
        return woolService.createNote(body);
    }

    @PutMapping("/api/wool/notes/{id}")
    public Map<String, Object> updateNote(@PathVariable("id") String id,
                                          @RequestBody(required = false) Map<String, Object> body) {
        return woolService.updateNote(id, body);
    }

    @DeleteMapping("/api/wool/notes/{id}")
    public Map<String, Object> deleteNote(@PathVariable("id") String id) {
        return woolService.deleteNote(id);
    }

    @PostMapping("/api/wool/notes/organize")
    public Map<String, Object> organize(@RequestBody(required = false) Map<String, Object> body) {
        return woolService.organize(body);
    }

    @PutMapping("/api/wool/{id}")
    public Map<String, Object> update(@PathVariable("id") String id,
                                      @RequestBody(required = false) Map<String, Object> body) {
        return woolService.update(id, body);
    }

    @DeleteMapping("/api/wool/{id}")
    public Map<String, Object> delete(@PathVariable("id") String id) {
        return woolService.delete(id);
    }

    @PostMapping("/api/wool/upload-image")
    public Map<String, Object> uploadImage(@RequestParam(value = "image", required = false) MultipartFile image) {
        return woolService.uploadImage(image);
    }

    @PostMapping("/api/wool/recognize")
    public Map<String, Object> recognize(@RequestBody(required = false) Map<String, Object> body) {
        return woolService.recognize(body);
    }

    @GetMapping("/api/wool/calendar")
    public List<Map<String, Object>> calendar(@RequestParam(value = "month", required = false) String month) {
        return woolService.calendar(month);
    }

    @GetMapping("/api/wool/daily/{date}")
    public Map<String, Object> getDaily(@PathVariable("date") String date) {
        return woolService.getDaily(date);
    }

    @PutMapping("/api/wool/daily/{date}")
    public Map<String, Object> putDaily(@PathVariable("date") String date,
                                        @RequestBody(required = false) Map<String, Object> body) {
        return woolService.putDaily(date, body);
    }
}
