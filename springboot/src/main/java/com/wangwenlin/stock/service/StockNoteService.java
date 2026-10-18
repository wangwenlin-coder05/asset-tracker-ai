package com.wangwenlin.stock.service;

import com.wangwenlin.stock.common.Ids;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.mapper.StockNoteMapper;
import com.wangwenlin.stock.model.StockNoteRow;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * /api/stock/notes 模块 —— 与 Node 端 server.js 同名路由逐行对齐（4 个路由）。
 */
@Service
public class StockNoteService {

    private final StockNoteMapper noteMapper;

    public StockNoteService(StockNoteMapper noteMapper) {
        this.noteMapper = noteMapper;
    }

    public List<Map<String, Object>> list() {
        List<Map<String, Object>> result = new ArrayList<>();
        for (StockNoteRow row : noteMapper.list()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", row.getId());
            item.put("title", row.getTitle());
            item.put("content", row.getContent());
            item.put("createdAt", row.getCreatedAt());
            item.put("updatedAt", row.getUpdatedAt());
            result.add(item);
        }
        return result;
    }

    public Map<String, Object> create(Map<String, Object> body) {
        Object title = JsValues.orEmptyValue(body.get("title"));
        Object content = JsValues.orEmptyValue(body.get("content"));
        String id = Ids.uuid();
        long now = System.currentTimeMillis();

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", id);
        data.put("title", title);
        data.put("content", content);
        data.put("createdAt", now);
        data.put("updatedAt", now);
        noteMapper.insert(data);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", id);
        result.put("title", title);
        result.put("content", content);
        result.put("createdAt", now);
        result.put("updatedAt", now);
        return result;
    }

    public Map<String, Object> update(String id, Map<String, Object> body) {
        Map<String, Object> data = new LinkedHashMap<>();
        // containsKey 区分“显式传 null”与“未传”，对齐 Node 端的 title !== undefined 判断
        if (body.containsKey("title")) {
            data.put("title", body.get("title"));
        }
        if (body.containsKey("content")) {
            data.put("content", body.get("content"));
        }
        if (data.isEmpty()) {
            return Map.of("ok", true);
        }
        data.put("updatedAt", System.currentTimeMillis());
        data.put("id", id);
        noteMapper.updateFields(data);
        return Map.of("ok", true);
    }

    public Map<String, Object> delete(String id) {
        noteMapper.deleteById(id);
        return Map.of("ok", true);
    }
}
