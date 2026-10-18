package com.wangwenlin.stock.mapper;

import com.wangwenlin.stock.model.DailyNoteRow;
import org.apache.ibatis.annotations.Param;

import java.util.Map;

/**
 * daily_notes 表访问。SQL 内不写 user_id —— 由 TenantLineInnerInterceptor 自动注入。
 */
public interface DailyNoteMapper {

    DailyNoteRow findOneByDate(@Param("date") String date);

    Integer insert(Map<String, Object> data);

    Integer updateContent(@Param("id") String id,
                          @Param("content") Object content,
                          @Param("updatedAt") long updatedAt);
}
