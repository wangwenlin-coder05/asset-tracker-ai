package com.wangwenlin.stock.model;

import lombok.Data;

import java.math.BigDecimal;

/**
 * wool_items 表查询行。amount 用 BigDecimal 接收 —— 对齐 Node 端 mysql2 把 DECIMAL 返回为字符串，
 * 业务侧统一走 Number() 转换，故 Java 侧保留精确值再转换。
 * created_at 为 BIGINT 毫秒时间戳，等价 mysql2 返回的 number。
 */
@Data
public class WoolItemRow {

    private String id;
    private String name;
    private BigDecimal amount;
    private String woolDate;
    private String icon;
    private String image;
    private String images;
    private String note;
    private String recordType;
    private String category;
    private String merchant;
    private String paymentMethod;
    private String depositItemId;
    private String depositTransactionId;
    private Long createdAt;
}
