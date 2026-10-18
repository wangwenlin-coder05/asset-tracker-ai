package com.wangwenlin.stock.model;

import lombok.Data;

/**
 * stock_daily_summary 表查询行。created_at / updated_at 为毫秒时间戳（bigint）。
 */
@Data
public class StockDailySummaryRow {

    private String id;
    private String date;
    private String content;
    private String autoContent;
    private Long createdAt;
    private Long updatedAt;
}
