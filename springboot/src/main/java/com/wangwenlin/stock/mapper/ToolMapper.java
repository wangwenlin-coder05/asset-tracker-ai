package com.wangwenlin.stock.mapper;

import com.wangwenlin.stock.model.ToolRow;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * 小工具（tools）表访问。SQL 内不写 user_id —— 由租户拦截器自动注入，与 Node 端行为一致。
 */
public interface ToolMapper {

    /** GET /api/tools/categories */
    List<String> listCategories();

    /** GET /api/tools */
    List<ToolRow> list();

    /** POST /api/tools */
    void insert(Map<String, Object> data);

    /** PUT /api/tools/:id：只更新请求里出现过的字段。 */
    void update(Map<String, Object> data);

    /** DELETE /api/tools/:id */
    void delete(@Param("id") String id);

    /** POST /api/tools/reorder */
    void updateSortOrder(@Param("id") Object id, @Param("sortOrder") Object sortOrder);
}
