package com.wangwenlin.stock.web;

import com.wangwenlin.stock.service.DailyNoteService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * /api/notes 路由（2 个）—— 路径与 Node 端一一对应。
 */
@RestController
@RequestMapping("/api/notes")
public class DailyNoteController {

    private final DailyNoteService noteService;

    public DailyNoteController(DailyNoteService noteService) {
        this.noteService = noteService;
    }

    @GetMapping("/{date}")
    public Map<String, Object> get(@PathVariable("date") String date) {
        return noteService.get(date);
    }

    @PutMapping("/{date}")
    public Map<String, Object> save(@PathVariable("date") String date,
                                    @RequestBody(required = false) Map<String, Object> body) {
        return noteService.save(date, body == null ? Map.of() : body);
    }
}
