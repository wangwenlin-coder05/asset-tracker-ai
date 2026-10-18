package com.wangwenlin.stock.mapper;

import com.wangwenlin.stock.model.DailyPlanRow;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * daily_plans 表访问。SQL 内不写 user_id —— 由 TenantLineInnerInterceptor 自动注入。
 */
public interface DailyPlanMapper {

    List<DailyPlanRow> listAll();

    Integer insert(Map<String, Object> data);

    /** 动态部分更新，data 中必须包含 id。 */
    Integer updateFields(Map<String, Object> data);

    Integer deleteById(@Param("id") String id);

    /** 重排：仅更新 sort_order，对齐 Node 端 /api/plans/reorder 的逐条 UPDATE。 */
    Integer updateSortOrder(@Param("id") String id, @Param("sortOrder") Object sortOrder);
}
