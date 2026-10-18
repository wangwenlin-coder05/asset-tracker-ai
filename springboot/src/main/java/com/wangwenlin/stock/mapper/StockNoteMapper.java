package com.wangwenlin.stock.mapper;

import com.wangwenlin.stock.model.StockNoteRow;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * stock_notes 表访问。SQL 内不写 user_id —— 由 TenantLineInnerInterceptor 自动注入。
 */
public interface StockNoteMapper {

    List<StockNoteRow> list();

    Integer insert(Map<String, Object> data);

    /** 动态部分更新，data 中必须包含 id 与 updatedAt。 */
    Integer updateFields(Map<String, Object> data);

    Integer deleteById(@Param("id") String id);
}
