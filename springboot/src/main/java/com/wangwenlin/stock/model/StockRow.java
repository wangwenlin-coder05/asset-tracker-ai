package com.wangwenlin.stock.model;

import lombok.Data;

import java.math.BigDecimal;

/**
 * stocks 表查询行。日期统一通过 DATE_FORMAT 以字符串返回，等价 Node 端 mysql2 的 dateStrings: true。
 */
@Data
public class StockRow {

    private String id;
    private String name;
    private String code;
    private String board;
    private String position;
    private String notes;

    private BigDecimal cost;
    private BigDecimal count;
    private BigDecimal sellPrice;
    private BigDecimal targetProfit;
    private BigDecimal profitLossRatio;
    private BigDecimal ratioPrice;
    private BigDecimal basePrice;
    private BigDecimal priceChangePercent;
    private BigDecimal buyPrice;
    private BigDecimal topTenFloatRatio;

    private Integer isCleared;
    private Integer frozenHoldingDays;

    /** DATE_FORMAT(buy_date, '%Y-%m-%d') 结果 */
    private String buyDateStr;
    /** DATE_FORMAT(sell_date, '%Y-%m-%d') 结果 */
    private String sellDateStr;
}
