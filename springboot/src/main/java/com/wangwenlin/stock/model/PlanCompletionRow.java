package com.wangwenlin.stock.model;

import lombok.Data;

/**
 * plan_completions 表查询行。completed 为 TINYINT，created_at 为 BIGINT 毫秒时间戳。
 */
@Data
public class PlanCompletionRow {

    private String id;
    private String planId;
    private String completeDate;
    private Integer completed;
    private Long createdAt;
}
