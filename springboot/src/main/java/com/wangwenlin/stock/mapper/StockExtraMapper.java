package com.wangwenlin.stock.mapper;

import com.wangwenlin.stock.model.IpoStockRow;
import com.wangwenlin.stock.model.IpoTradeRow;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 股票杂项 API 用的表访问（打新底仓市值）。SQL 内不写 user_id —— 由租户拦截器自动注入。
 */
public interface StockExtraMapper {

    List<IpoStockRow> listIpoStocks();

    List<IpoTradeRow> listIpoBuys(@Param("stockIds") List<String> stockIds);

    List<IpoTradeRow> listIpoSells(@Param("stockIds") List<String> stockIds);
}
