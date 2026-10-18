package com.wangwenlin.stock.model;

import lombok.Data;

/**
 * daily_task_states 表查询行。
 */
@Data
public class DailyTaskStateRow {

    private String taskId;
    private String taskDate;
    private String status;
}
