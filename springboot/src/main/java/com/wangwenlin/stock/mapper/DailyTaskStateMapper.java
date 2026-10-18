package com.wangwenlin.stock.mapper;

import com.wangwenlin.stock.model.DailyTaskStateRow;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * daily_task_states 表访问。SQL 内不写 user_id —— 由 TenantLineInnerInterceptor 自动注入。
 */
public interface DailyTaskStateMapper {

    List<DailyTaskStateRow> listUpTo(@Param("date") String date);

    Integer upsert(Map<String, Object> data);

    Integer deleteByTaskId(@Param("taskId") String taskId);
}
