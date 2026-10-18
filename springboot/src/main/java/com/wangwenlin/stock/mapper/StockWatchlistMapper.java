package com.wangwenlin.stock.mapper;

import com.wangwenlin.stock.model.StockWatchlistRow;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * stock_watchlist 表访问。SQL 内不写 user_id —— 由 TenantLineInnerInterceptor 自动注入。
 */
public interface StockWatchlistMapper {

    List<StockWatchlistRow> list();

    /** 取观察股代码：等价 Node 端 analysis INSERT 里的子查询 (SELECT code FROM stock_watchlist WHERE id = ?)。 */
    String findCodeById(@Param("id") String id);

    Integer insert(Map<String, Object> data);

    /** 动态部分更新，data 中必须包含 id 与 updatedAt。 */
    Integer updateFields(Map<String, Object> data);

    Integer deleteById(@Param("id") String id);
}
