package com.wangwenlin.stock.model;

import lombok.Data;

/**
 * stock_daily_analysis 表查询行。价格三项为 VARCHAR（支持 6.40~6.50 区间写法），因此保持字符串。
 */
@Data
public class StockDailyAnalysisRow {

    private String id;
    private String watchId;
    private String date;
    private String actionType;
    private String sentiment;
    private String targetBuyPrice;
    private String targetBuyPriceHigh;
    private String targetSellPrice;
    private String targetSellPriceHigh;
    private String stopLossPrice;
    private String stopLossPriceHigh;
    private Integer buyShareCount;
    private Integer sellShareCount;
    private Integer lossShareCount;
    private String note;
    private String nextDayNote;
    private String reviewResult;
    private String reviewNote;
    private Long createdAt;
    private Long updatedAt;
}
