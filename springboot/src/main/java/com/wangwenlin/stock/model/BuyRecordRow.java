package com.wangwenlin.stock.model;

import lombok.Data;

import java.math.BigDecimal;

/**
 * buy_records 表查询行。
 */
@Data
public class BuyRecordRow {

    private String id;
    private String stockId;
    private String tType;
    private String tGroupId;

    private BigDecimal buyPrice;
    private BigDecimal buyCount;
    private BigDecimal commission;
    private BigDecimal transferFee;
    private BigDecimal handlingFee;
    private BigDecimal regulatoryFee;
    private BigDecimal tProfit;
    private BigDecimal costChange;

    /** DATE_FORMAT(buy_date, '%Y-%m-%d') 结果 */
    private String buyDateStr;
    /** DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') 结果 */
    private String createdAtStr;
}
