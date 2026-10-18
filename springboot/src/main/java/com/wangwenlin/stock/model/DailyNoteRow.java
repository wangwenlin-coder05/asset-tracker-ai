package com.wangwenlin.stock.model;

import lombok.Data;

/**
 * daily_notes 表查询行。created_at / updated_at 为 BIGINT 毫秒时间戳。
 */
@Data
public class DailyNoteRow {

    private String id;
    private String noteDate;
    private String content;
    private Long createdAt;
    private Long updatedAt;
}
