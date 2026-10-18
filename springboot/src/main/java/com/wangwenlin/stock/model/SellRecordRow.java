package com.wangwenlin.stock.model;

import lombok.Data;

import java.math.BigDecimal;

/**
 * sell_records 表查询行。
 */
@Data
public class SellRecordRow {

    private String id;
    private String stockId;
    private String position;
    private String tType;
    private String tGroupId;

    private BigDecimal sellPrice;
    private BigDecimal sellCount;
    private BigDecimal sellCommission;
    private BigDecimal sellTransferFee;
    private BigDecimal stampTax;
    private BigDecimal handlingFee;
    private BigDecimal regulatoryFee;
    private BigDecimal otherFee;
    private BigDecimal netProfit;
    private BigDecimal tProfit;

    private Integer tPending;

    /** DATE_FORMAT(sell_date, '%Y-%m-%d') 结果 */
    private String sellDateStr;
    /** DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') 结果 */
    private String createdAtStr;
}
