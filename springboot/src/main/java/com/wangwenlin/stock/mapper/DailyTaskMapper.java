package com.wangwenlin.stock.mapper;

import com.wangwenlin.stock.model.DailyTaskRow;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * daily_tasks 表访问。SQL 内不写 user_id —— 由 TenantLineInnerInterceptor 自动注入。
 */
public interface DailyTaskMapper {

    List<DailyTaskRow> listAll();

    DailyTaskRow findById(@Param("id") String id);

    Integer insert(Map<String, Object> data);

    Integer update(Map<String, Object> data);

    Integer deleteById(@Param("id") String id);
}
