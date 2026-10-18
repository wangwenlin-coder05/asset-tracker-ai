package com.wangwenlin.stock.model;

import lombok.Data;

/**
 * 打新底仓市值计算用：单条买入/卖出记录（只取股数 + 日期）。
 * date 由 DATE_FORMAT 输出为 'YYYY-MM-DD' 字符串。
 */
@Data
public class IpoTradeRow {

    private String stockId;
    private Double count;
    private String date;
}
