package com.wangwenlin.stock.web;

import com.wangwenlin.stock.service.StockNoteService;
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
 * /api/stock/notes 路由（4 个）—— 路径与 Node 端一一对应。
 */
@RestController
@RequestMapping("/api/stock/notes")
public class StockNoteController {

    private final StockNoteService noteService;

    public StockNoteController(StockNoteService noteService) {
        this.noteService = noteService;
    }

    @GetMapping
    public List<Map<String, Object>> list() {
        return noteService.list();
    }

    @PostMapping
    public Map<String, Object> create(@RequestBody(required = false) Map<String, Object> body) {
        return noteService.create(body(body));
    }

    @PutMapping("/{id}")
    public Map<String, Object> update(@PathVariable("id") String id,
                                      @RequestBody(required = false) Map<String, Object> body) {
        return noteService.update(id, body(body));
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable("id") String id) {
        return noteService.delete(id);
    }

    private static Map<String, Object> body(Map<String, Object> body) {
        return body == null ? Map.of() : body;
    }
}
