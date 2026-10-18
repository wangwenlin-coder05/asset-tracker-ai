package com.wangwenlin.stock.model;

import lombok.Data;

/**
 * wool_notes 表查询行。created_at / updated_at 为 BIGINT 毫秒时间戳。
 */
@Data
public class WoolNoteRow {

    private String id;
    private String noteType;
    private String title;
    private String content;
    private Long createdAt;
    private Long updatedAt;
}
