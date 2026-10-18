package com.wangwenlin.stock.service;

import com.wangwenlin.stock.common.Ids;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.mapper.DailyNoteMapper;
import com.wangwenlin.stock.model.DailyNoteRow;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * /api/notes 模块 —— 与 Node 端 server.js 10219-10258 逐行对齐（2 个路由）。
 */
@Service
public class DailyNoteService {

    private final DailyNoteMapper noteMapper;

    public DailyNoteService(DailyNoteMapper noteMapper) {
        this.noteMapper = noteMapper;
    }

    public Map<String, Object> get(String date) {
        DailyNoteRow row = noteMapper.findOneByDate(date);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("date", date);
        result.put("content", row == null ? "" : JsValues.orEmptyValue(row.getContent()));
        return result;
    }

    public Map<String, Object> save(String date, Map<String, Object> body) {
        Object content = JsValues.orEmptyValue(body.get("content"));
        long now = System.currentTimeMillis();
        DailyNoteRow existing = noteMapper.findOneByDate(date);
        if (existing != null) {
            noteMapper.updateContent(existing.getId(), content, now);
        } else {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("id", Ids.uuid());
            data.put("noteDate", date);
            data.put("content", content);
            data.put("createdAt", now);
            data.put("updatedAt", now);
            noteMapper.insert(data);
        }
        return Map.of("ok", true);
    }
}
