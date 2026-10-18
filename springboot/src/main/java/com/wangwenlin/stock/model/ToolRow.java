package com.wangwenlin.stock.model;

import lombok.Data;

/**
 * tools 表行（小工具收藏）。列顺序与真实表结构一致，对齐 Node 端 SELECT *。
 */
@Data
public class ToolRow {

    private String id;
    private String name;
    private String url;
    private String icon;
    private String note;
    private String category;
    private Integer sortOrder;
    private Long createdAt;
    private Long updatedAt;
}
