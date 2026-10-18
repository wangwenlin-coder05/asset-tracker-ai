package com.wangwenlin.stock.mapper;

import com.wangwenlin.stock.model.StockDailySummaryRow;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * stock_daily_summary 表访问。SQL 内不写 user_id —— 由租户拦截器自动注入。
 */
public interface StockDailySummaryMapper {

    List<StockDailySummaryRow> listByDate(@Param("date") String date);

    List<String> listIdsByDate(@Param("date") String date);

    Integer updateContent(Map<String, Object> data);

    Integer insert(Map<String, Object> data);
}
