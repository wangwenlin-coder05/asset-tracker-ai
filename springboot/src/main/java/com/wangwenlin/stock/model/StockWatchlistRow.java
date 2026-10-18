package com.wangwenlin.stock.model;

import lombok.Data;

/**
 * stock_watchlist 表查询行。
 */
@Data
public class StockWatchlistRow {

    private String id;
    private String code;
    private String name;
    private Integer isHolding;
    private Integer pinned;
    private Integer sortOrder;
    private Long createdAt;
    private Long updatedAt;
}
