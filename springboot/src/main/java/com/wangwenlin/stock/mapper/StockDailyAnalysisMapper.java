package com.wangwenlin.stock.mapper;

import com.wangwenlin.stock.model.StockDailyAnalysisRow;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * stock_daily_analysis 表访问。SQL 内不写 user_id —— 由 TenantLineInnerInterceptor 自动注入。
 */
public interface StockDailyAnalysisMapper {

    List<StockDailyAnalysisRow> listByWatchIds(@Param("watchIds") List<String> watchIds);

    /** 对齐 Node 端的「先查有没有」：SELECT id ... WHERE watch_id = ? AND date = ? */
    List<Map<String, Object>> findIdsByWatchAndDate(@Param("watchId") String watchId, @Param("date") Object date);

    Integer insert(Map<String, Object> data);

    /** 动态部分更新，data 中必须包含 id 与 updatedAt。 */
    Integer updateFields(Map<String, Object> data);

    Integer deleteByWatchId(@Param("watchId") String watchId);

    Integer deleteByWatchIdAndDate(@Param("watchId") String watchId, @Param("date") String date);
}
