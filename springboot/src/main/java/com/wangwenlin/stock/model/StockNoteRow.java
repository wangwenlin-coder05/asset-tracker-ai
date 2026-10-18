package com.wangwenlin.stock.model;

import lombok.Data;

/**
 * stock_notes 表查询行。created_at / updated_at 为 BIGINT 毫秒时间戳，等价 Node 端 mysql2 返回的 number。
 */
@Data
public class StockNoteRow {

    private String id;
    private String title;
    private String content;
    private Long createdAt;
    private Long updatedAt;
}
