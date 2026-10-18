package com.wangwenlin.stock.service;

import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.common.Ids;
import com.wangwenlin.stock.common.JsStrings;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.mapper.DailyTaskMapper;
import com.wangwenlin.stock.mapper.DailyTaskStateMapper;
import com.wangwenlin.stock.model.DailyTaskRow;
import com.wangwenlin.stock.model.DailyTaskStateRow;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * /api/daily-tasks 模块 —— 与 Node 端 backend/daily-tasks.js 逐行对齐（5 个路由）。
 */
@Service
public class DailyTaskService {

    private static final ZoneId SHANGHAI = ZoneId.of("Asia/Shanghai");
    private static final Set<String> PRIORITIES = Set.of("high", "medium", "low");
    private static final Set<String> REPEATS = Set.of("once", "daily");
    private static final Set<String> STATUSES = Set.of("pending", "done", "skipped");
    private static final String SERVICE_ERROR = "任务服务暂不可用，请稍后重试";

    private final DailyTaskMapper taskMapper;
    private final DailyTaskStateMapper stateMapper;

    public DailyTaskService(DailyTaskMapper taskMapper, DailyTaskStateMapper stateMapper) {
        this.taskMapper = taskMapper;
        this.stateMapper = stateMapper;
    }

    /** 对齐 Node 端 localDay()：Asia/Shanghai 时区的 YYYY-MM-DD。 */
    private static String localDay() {
        return LocalDate.now(SHANGHAI).toString();
    }

    /**
     * 对齐 Node 端 validDate(value)：
     * 先做 YYYY-MM-DD 正则，再还原日期；月/日超过合法区间时 JS 会得到 Invalid Date 并在
     * toISOString() 抛 RangeError，最终被路由 handler 收敛为 500「任务服务暂不可用」，此处保持一致。
     */
    static boolean validDate(String value) {
        if (value == null || !value.matches("\\d{4}-\\d{2}-\\d{2}")) {
            return false;
        }
        int month = Integer.parseInt(value.substring(5, 7));
        int day = Integer.parseInt(value.substring(8, 10));
        if (month < 1 || month > 12 || day < 1 || day > 31) {
            throw new ApiException(500, SERVICE_ERROR);
        }
        LocalDate normalized = LocalDate.of(Integer.parseInt(value.substring(0, 4)), month, 1).plusDays(day - 1);
        return value.equals(normalized.toString());
    }

    public Map<String, Object> list(String dateRaw) {
        String date = (dateRaw == null || dateRaw.isEmpty()) ? localDay() : dateRaw;
        if (!validDate(date)) {
            throw ApiException.badRequest("日期无效");
        }
        List<DailyTaskRow> rows = taskMapper.listAll();
        Map<String, String> stateMap = new LinkedHashMap<>();
        for (DailyTaskStateRow state : stateMapper.listUpTo(date)) {
            stateMap.put(state.getTaskId() + ":" + state.getTaskDate(), state.getStatus());
        }

        List<Map<String, Object>> tasks = new ArrayList<>();
        for (DailyTaskRow row : rows) {
            if (isActive(row, date)) {
                Map<String, Object> item = serialize(row);
                item.put("status", orPending(stateMap.get(row.getId() + ":" + date)));
                tasks.add(item);
            }
        }

        List<Map<String, Object>> history = new ArrayList<>();
        LocalDate base = LocalDate.parse(date);
        for (int offset = 6; offset >= 0; offset--) {
            String key = base.minusDays(offset).toString();
            int total = 0;
            int done = 0;
            for (DailyTaskRow row : rows) {
                if (!isActive(row, key)) {
                    continue;
                }
                String status = stateMap.get(row.getId() + ":" + key);
                if ("skipped".equals(status)) {
                    continue;
                }
                total++;
                if ("done".equals(status)) {
                    done++;
                }
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("date", key);
            item.put("total", total);
            item.put("done", done);
            history.add(item);
        }

        int streak = 0;
        LocalDate cursor = LocalDate.parse(date);
        for (int offset = 0; offset < 3660; offset++) {
            String key = cursor.toString();
            boolean completed = false;
            for (DailyTaskRow row : rows) {
                if (isActive(row, key) && "done".equals(stateMap.get(row.getId() + ":" + key))) {
                    completed = true;
                    break;
                }
            }
            if (!completed && offset != 0) {
                break;
            }
            if (completed) {
                streak++;
            }
            cursor = cursor.minusDays(1);
        }

        List<DailyTaskRow> upcomingRows = new ArrayList<>();
        for (DailyTaskRow row : rows) {
            if (row.getDueDate().compareTo(date) > 0) {
                upcomingRows.add(row);
            }
        }
        upcomingRows.sort(Comparator.comparing(DailyTaskRow::getDueDate));
        List<Map<String, Object>> upcoming = new ArrayList<>();
        for (DailyTaskRow row : upcomingRows.subList(0, Math.min(12, upcomingRows.size()))) {
            Map<String, Object> item = serialize(row);
            item.put("status", orPending(stateMap.get(row.getId() + ":" + date)));
            item.put("upcoming", true);
            upcoming.add(item);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("date", date);
        result.put("tasks", tasks);
        result.put("history", history);
        result.put("streak", streak);
        result.put("upcoming", upcoming);
        return result;
    }

    public Map<String, Object> create(Map<String, Object> body) {
        Map<String, Object> task = normalizeTask(body);
        String id = Ids.uuid();
        long createdAt = System.currentTimeMillis();
        Map<String, Object> data = new LinkedHashMap<>(task);
        data.put("id", id);
        data.put("createdAt", createdAt);
        taskMapper.insert(data);

        Map<String, Object> result = new LinkedHashMap<>(task);
        result.put("id", id);
        result.put("createdAt", createdAt);
        result.put("status", "pending");
        return result;
    }

    public Map<String, Object> update(String id, Map<String, Object> body) {
        Map<String, Object> task = normalizeTask(body);
        Map<String, Object> data = new LinkedHashMap<>(task);
        data.put("id", id);
        int affected = taskMapper.update(data);
        if (affected == 0) {
            throw ApiException.notFound("任务不存在");
        }
        return Map.of("ok", true);
    }

    public Map<String, Object> updateState(String id, Map<String, Object> body) {
        Object dateRaw = body.get("date");
        Object statusRaw = body.get("status");
        String date = JsValues.toJsString(dateRaw);
        String status = JsValues.toJsString(statusRaw);
        if (!validDate(date) || !STATUSES.contains(status)) {
            throw ApiException.badRequest("状态或日期无效");
        }
        DailyTaskRow task = taskMapper.findById(id);
        if (task == null || task.getDueDate().compareTo(date) > 0
                || (!"daily".equals(task.getRepeatType()) && !task.getDueDate().equals(date))) {
            throw ApiException.notFound("该日期的任务不存在");
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", Ids.uuid());
        data.put("taskId", task.getId());
        data.put("taskDate", date);
        data.put("status", status);
        stateMapper.upsert(data);
        return Map.of("ok", true);
    }

    public Map<String, Object> delete(String id) {
        stateMapper.deleteByTaskId(id);
        int affected = taskMapper.deleteById(id);
        if (affected == 0) {
            throw ApiException.notFound("任务不存在");
        }
        return Map.of("ok", true);
    }

    private static boolean isActive(DailyTaskRow row, String day) {
        return row.getDueDate().compareTo(day) <= 0
                && ("daily".equals(row.getRepeatType()) || row.getDueDate().equals(day));
    }

    private static String orPending(String status) {
        return JsValues.truthy(status) ? status : "pending";
    }

    private static Map<String, Object> serialize(DailyTaskRow row) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", row.getId());
        item.put("title", row.getTitle());
        item.put("description", row.getDescription());
        item.put("dueDate", row.getDueDate());
        item.put("priority", row.getPriority());
        item.put("repeat", row.getRepeatType());
        item.put("reminder", row.getReminder());
        item.put("tag", row.getTag());
        item.put("createdAt", row.getCreatedAt() == null ? 0L : row.getCreatedAt());
        return item;
    }

    private static Map<String, Object> normalizeTask(Map<String, Object> body) {
        String title = JsStrings.trim(JsValues.toJsString(orEmpty(body.get("title"))));
        Object dueDateRaw = JsValues.truthy(body.get("dueDate")) ? body.get("dueDate") : localDay();
        String dueDate = JsValues.toJsString(dueDateRaw);
        String priority = JsValues.toJsString(orFallback(body.get("priority"), "medium"));
        String repeat = JsValues.toJsString(orFallback(body.get("repeat"), "once"));
        String reminder = JsValues.toJsString(orEmpty(body.get("reminder")));
        String description = slice(JsValues.toJsString(orEmpty(body.get("description"))), 500);
        String tag = slice(JsStrings.trim(JsValues.toJsString(orEmpty(body.get("tag")))), 30);

        if (title.isEmpty() || title.length() > 100 || !validDate(dueDate)
                || !PRIORITIES.contains(priority)
                || !REPEATS.contains(repeat)
                || (!reminder.isEmpty() && !reminder.matches("^([01]\\d|2[0-3]):[0-5]\\d$"))) {
            throw ApiException.badRequest("请填写有效的任务名称、日期、优先级和提醒时间");
        }

        Map<String, Object> task = new LinkedHashMap<>();
        task.put("title", title);
        task.put("description", description);
        task.put("dueDate", dueDate);
        task.put("priority", priority);
        task.put("repeat", repeat);
        task.put("reminder", reminder);
        task.put("tag", tag);
        return task;
    }

    /** 等价 JS {@code value || ''} 且保留「假值一律空串」的语义。 */
    private static Object orEmpty(Object value) {
        return JsValues.truthy(value) ? value : "";
    }

    /** 等价 JS {@code value || fallback}。 */
    private static Object orFallback(Object value, Object fallback) {
        return JsValues.truthy(value) ? value : fallback;
    }

    /** 等价 JS {@code str.slice(0, max)}：按 UTF-16 code unit 截断。 */
    private static String slice(String value, int max) {
        return value.length() > max ? value.substring(0, max) : value;
    }
}
