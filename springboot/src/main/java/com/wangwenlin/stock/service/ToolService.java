package com.wangwenlin.stock.service;

import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.common.Ids;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.mapper.ToolMapper;
import com.wangwenlin.stock.model.ToolRow;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 小工具收藏（/api/tools）。逐行对齐 Node 端 server.js 5541-5638 的行
 * 为（含各自固定文案的 catch 分支）。
 */
@Service
public class ToolService {

    private static final Logger log = LoggerFactory.getLogger(ToolService.class);

    private final ToolMapper mapper;

    public ToolService(ToolMapper mapper) {
        this.mapper = mapper;
    }

    /** GET /api/tools/categories：只返回非空分类，升序。 */
    public List<String> categories() {
        try {
            return mapper.listCategories();
        } catch (Exception error) {
            log.error("获取工具分类失败", error);
            throw new ApiException(500, "获取失败");
        }
    }

    /** GET /api/tools：按分类 / 排序 / 创建时间排列，字段顺序与 Node 完全一致。 */
    public List<Map<String, Object>> list() {
        try {
            List<Map<String, Object>> result = new ArrayList<>();
            for (ToolRow row : mapper.list()) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", row.getId());
                item.put("name", row.getName());
                item.put("url", row.getUrl());
                item.put("icon", JsValues.orDefault(row.getIcon(), ""));
                item.put("note", JsValues.orDefault(row.getNote(), ""));
                item.put("category", JsValues.orDefault(row.getCategory(), ""));
                item.put("sortOrder", row.getSortOrder());
                item.put("createdAt", row.getCreatedAt());
                item.put("updatedAt", row.getUpdatedAt());
                result.add(item);
            }
            return result;
        } catch (Exception error) {
            log.error("获取小工具列表失败", error);
            throw new ApiException(500, "获取失败");
        }
    }

    /** POST /api/tools：name / url 必填。 */
    public Map<String, Object> create(Object rawBody) {
        Map<String, Object> body = asMap(rawBody);
        Object name = body.get("name");
        Object url = body.get("url");
        if (!JsValues.truthy(name) || !JsValues.truthy(url)) {
            throw new ApiException(400, "名称和链接不能为空");
        }
        try {
            String id = Ids.genId();
            long now = System.currentTimeMillis();
            Object icon = JsValues.orEmptyValue(body.get("icon"));
            Object note = JsValues.orEmptyValue(body.get("note"));
            Object category = JsValues.orEmptyValue(body.get("category"));
            Object sortOrder = JsValues.truthy(body.get("sortOrder")) ? body.get("sortOrder") : 0;

            Map<String, Object> data = new LinkedHashMap<>();
            data.put("id", id);
            data.put("name", name);
            data.put("url", url);
            data.put("icon", icon);
            data.put("note", note);
            data.put("category", category);
            data.put("sortOrder", sortOrder);
            data.put("createdAt", now);
            data.put("updatedAt", now);
            mapper.insert(data);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("id", id);
            result.put("name", name);
            result.put("url", url);
            result.put("icon", icon);
            result.put("note", note);
            result.put("category", category);
            result.put("sortOrder", sortOrder);
            result.put("createdAt", now);
            result.put("updatedAt", now);
            return result;
        } catch (Exception error) {
            log.error("新增小工具失败", error);
            throw new ApiException(500, "新增失败");
        }
    }

    /** PUT /api/tools/:id：请求里一个可写字段都没出现时直接返回 ok，不产生 UPDATE。 */
    public Map<String, Object> update(String id, Object rawBody) {
        Map<String, Object> body = asMap(rawBody);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", id);
        if (body.containsKey("name")) {
            data.put("name", body.get("name"));
        }
        if (body.containsKey("url")) {
            data.put("url", body.get("url"));
        }
        if (body.containsKey("icon")) {
            data.put("icon", body.get("icon"));
        }
        if (body.containsKey("note")) {
            data.put("note", body.get("note"));
        }
        if (body.containsKey("category")) {
            data.put("category", body.get("category"));
        }
        if (body.containsKey("sortOrder")) {
            data.put("sortOrder", body.get("sortOrder"));
        }
        if (data.size() == 1) {
            return ok();
        }
        try {
            data.put("updatedAt", System.currentTimeMillis());
            mapper.update(data);
            return ok();
        } catch (Exception error) {
            log.error("更新小工具失败", error);
            throw new ApiException(500, "更新失败");
        }
    }

    /** DELETE /api/tools/:id */
    public Map<String, Object> remove(String id) {
        try {
            mapper.delete(id);
            return ok();
        } catch (Exception error) {
            log.error("删除小工具失败", error);
            throw new ApiException(500, "删除失败");
        }
    }

    /** POST /api/tools/reorder：order 必须是数组，逐条写 sort_order（非数字按 0）。 */
    public Map<String, Object> reorder(Object rawBody) {
        Map<String, Object> body = asMap(rawBody);
        Object order = body.get("order");
        if (!(order instanceof List<?> list)) {
            throw new ApiException(400, "参数错误");
        }
        try {
            for (Object item : list) {
                // Node 端直接取 item.id / item.sortOrder，非对象或缺少 id 会因 undefined 绑定失败 → 500
                if (!(item instanceof Map<?, ?> itemMap) || !itemMap.containsKey("id")) {
                    throw new IllegalStateException("绑定参数不能为 undefined");
                }
                Object sortOrder = JsValues.truthy(itemMap.get("sortOrder")) ? itemMap.get("sortOrder") : 0;
                mapper.updateSortOrder(itemMap.get("id"), sortOrder);
            }
            return ok();
        } catch (Exception error) {
            log.error("重排小工具失败", error);
            throw new ApiException(500, "操作失败");
        }
    }

    private static Map<String, Object> ok() {
        Map<String, Object> map = new LinkedHashMap<>(1);
        map.put("ok", true);
        return map;
    }

    /** 请求体统一收敛成有序 Map；非对象（数组 / 标量 / 空）视为没有任何字段。 */
    private static Map<String, Object> asMap(Object body) {
        Map<String, Object> map = new LinkedHashMap<>();
        if (body instanceof Map<?, ?> raw) {
            for (Map.Entry<?, ?> entry : raw.entrySet()) {
                map.put(String.valueOf(entry.getKey()), entry.getValue());
            }
        }
        return map;
    }
}
