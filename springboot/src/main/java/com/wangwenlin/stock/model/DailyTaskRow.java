package com.wangwenlin.stock.model;

import lombok.Data;

/**
 * daily_tasks 表查询行。created_at 为 BIGINT 毫秒时间戳。
 */
@Data
public class DailyTaskRow {

    private String id;
    private String title;
    private String description;
    private String dueDate;
    private String priority;
    private String repeatType;
    private String reminder;
    private String tag;
    private Long createdAt;
}
