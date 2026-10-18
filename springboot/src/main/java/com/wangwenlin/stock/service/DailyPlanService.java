package com.wangwenlin.stock.service;

import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.common.Ids;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.mapper.DailyPlanMapper;
import com.wangwenlin.stock.mapper.PlanCompletionMapper;
import com.wangwenlin.stock.model.DailyPlanRow;
import com.wangwenlin.stock.model.PlanCompletionRow;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * /api/plans 模块 —— 与 Node 端 server.js 5857-5984 逐行对齐（7 个路由）。
 */
@Service
public class DailyPlanService {

    private final DailyPlanMapper planMapper;
    private final PlanCompletionMapper completionMapper;

    public DailyPlanService(DailyPlanMapper planMapper, PlanCompletionMapper completionMapper) {
        this.planMapper = planMapper;
        this.completionMapper = completionMapper;
    }

    public List<Map<String, Object>> list() {
        List<Map<String, Object>> result = new ArrayList<>();
        for (DailyPlanRow row : planMapper.listAll()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", row.getId());
            item.put("title", row.getTitle());
            item.put("periodType", row.getPeriodType());
            item.put("periodValue", row.getPeriodValue());
            item.put("icon", row.getIcon());
            item.put("sortOrder", row.getSortOrder());
            result.add(item);
        }
        return result;
    }

    public Map<String, Object> create(Map<String, Object> body) {
        Object title = body.get("title");
        String id = Ids.uuid();
        long now = System.currentTimeMillis();

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", id);
        data.put("title", JsValues.orEmptyValue(title));
        data.put("periodType", orFallback(body.get("periodType"), "daily"));
        data.put("periodValue", orFallback(body.get("periodValue"), 0));
        data.put("icon", JsValues.orEmptyValue(body.get("icon")));
        data.put("sortOrder", orFallback(body.get("sortOrder"), 0));
        data.put("createdAt", now);
        planMapper.insert(data);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", id);
        // 响应里的 title 直接用原值：JS 的 undefined 会被 JSON.stringify 丢弃，故仅在字段存在时输出
        if (body.containsKey("title")) {
            result.put("title", title);
        }
        result.put("periodType", orFallback(body.get("periodType"), "daily"));
        result.put("periodValue", orFallback(body.get("periodValue"), 0));
        result.put("icon", JsValues.orEmptyValue(body.get("icon")));
        result.put("sortOrder", orFallback(body.get("sortOrder"), 0));
        return result;
    }

    public Map<String, Object> update(String id, Map<String, Object> body) {
        Map<String, Object> data = new LinkedHashMap<>();
        // containsKey 对应 Node 的 req.body[key] !== undefined（显式传 null 也算存在）
        if (body.containsKey("title")) {
            data.put("title", body.get("title"));
        }
        if (body.containsKey("periodType")) {
            data.put("periodType", body.get("periodType"));
        }
        if (body.containsKey("periodValue")) {
            data.put("periodValue", body.get("periodValue"));
        }
        if (body.containsKey("icon")) {
            data.put("icon", body.get("icon"));
        }
        if (body.containsKey("sortOrder")) {
            data.put("sortOrder", body.get("sortOrder"));
        }
        if (data.isEmpty()) {
            return Map.of("ok", true);
        }
        data.put("id", id);
        planMapper.updateFields(data);
        return Map.of("ok", true);
    }

    public Map<String, Object> delete(String id) {
        planMapper.deleteById(id);
        completionMapper.deleteByPlanId(id);
        return Map.of("ok", true);
    }

    public Map<String, Object> completions(String date) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (PlanCompletionRow row : completionMapper.listByDate(date)) {
            map.put(row.getPlanId(), row.getCompleted() != null && row.getCompleted() == 1);
        }
        return map;
    }

    public Map<String, Object> toggle(String id, Map<String, Object> body) {
        Object date = body.get("date");
        if (!JsValues.truthy(date)) {
            throw ApiException.badRequest("缺少日期");
        }
        String dateText = JsValues.toJsString(date);
        PlanCompletionRow existing = completionMapper.findOne(id, dateText);
        boolean newCompleted;
        if (existing != null) {
            newCompleted = existing.getCompleted() == null || existing.getCompleted() != 1;
            completionMapper.updateCompleted(existing.getId(), newCompleted ? 1 : 0);
        } else {
            PlanCompletionRow row = new PlanCompletionRow();
            row.setId(Ids.uuid());
            row.setPlanId(id);
            row.setCompleteDate(dateText);
            row.setCompleted(1);
            row.setCreatedAt(System.currentTimeMillis());
            completionMapper.insert(row);
            newCompleted = true;
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("completed", newCompleted);
        return result;
    }

    public Map<String, Object> reorder(Map<String, Object> body) {
        Object order = body.get("order");
        if (!(order instanceof List<?> list)) {
            throw ApiException.badRequest("参数错误");
        }
        for (Object item : list) {
            Object idRaw = null;
            Object sortRaw = null;
            if (item instanceof Map<?, ?> map) {
                idRaw = map.get("id");
                sortRaw = map.get("sortOrder");
            }
            planMapper.updateSortOrder(JsValues.truthyStringOrNull(idRaw), JsValues.truthy(sortRaw) ? sortRaw : 0);
        }
        return Map.of("ok", true);
    }

    /** 等价于 JS 的 {@code value || fallback}：真值取原值，假值取兜底。 */
    private static Object orFallback(Object value, Object fallback) {
        return JsValues.truthy(value) ? value : fallback;
    }
}
