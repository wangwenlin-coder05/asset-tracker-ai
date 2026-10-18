package com.wangwenlin.stock.model;

import lombok.Data;

/** 打新底仓市值计算用：未清仓股票的最小字段视图。 */
@Data
public class IpoStockRow {

    private String id;
    private String code;
}
