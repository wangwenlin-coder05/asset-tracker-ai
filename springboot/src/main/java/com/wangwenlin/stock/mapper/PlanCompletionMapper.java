package com.wangwenlin.stock.mapper;

import com.wangwenlin.stock.model.PlanCompletionRow;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * plan_completions 表访问。SQL 内不写 user_id —— 由 TenantLineInnerInterceptor 自动注入。
 */
public interface PlanCompletionMapper {

    List<PlanCompletionRow> listByDate(@Param("date") String date);

    PlanCompletionRow findOne(@Param("planId") String planId, @Param("date") String date);

    Integer insert(PlanCompletionRow row);

    Integer updateCompleted(@Param("id") String id, @Param("completed") Integer completed);

    Integer deleteByPlanId(@Param("planId") String planId);
}
