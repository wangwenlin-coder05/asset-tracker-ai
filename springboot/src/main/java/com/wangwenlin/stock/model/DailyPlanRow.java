package com.wangwenlin.stock.model;

import lombok.Data;

/**
 * daily_plans 表查询行。period_value / sort_order 为 INT，created_at 为 BIGINT 毫秒时间戳，
 * 等价 Node 端 mysql2 返回的 number。
 */
@Data
public class DailyPlanRow {

    private String id;
    private String title;
    private String periodType;
    private Integer periodValue;
    private String icon;
    private Integer sortOrder;
    private Long createdAt;
}
