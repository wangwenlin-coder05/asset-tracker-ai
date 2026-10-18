package com.wangwenlin.stock.web.dto;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

/**
 * 卖出记录响应体。字段名与 Node 端 getSellRecords() 的返回键逐一对齐（前端依赖）。
 * <p>
 * 显式声明字段可见、关闭 getter 推导：否则 Lombok 的 getTPending()/getTType() 会被 Jackson
 * 反推出 tpending/ttype 等错误键名（JavaBeans 前导大写串整体小写化）。
 */
@Data
@JsonAutoDetect(fieldVisibility = JsonAutoDetect.Visibility.ANY,
        getterVisibility = JsonAutoDetect.Visibility.NONE,
        isGetterVisibility = JsonAutoDetect.Visibility.NONE,
        setterVisibility = JsonAutoDetect.Visibility.NONE)
public class SellRecordDto {

    @JsonProperty("id")
    private String id;

    @JsonProperty("sellDate")
    private String sellDate;

    @JsonProperty("sellPrice")
    private Double sellPrice;

    @JsonProperty("sellCount")
    private Double sellCount;

    @JsonProperty("position")
    private String position;

    @JsonProperty("sellCommission")
    private Double sellCommission;

    @JsonProperty("sellTransferFee")
    private Double sellTransferFee;

    @JsonProperty("stampTax")
    private Double stampTax;

    @JsonProperty("handlingFee")
    private Double handlingFee;

    @JsonProperty("regulatoryFee")
    private Double regulatoryFee;

    @JsonProperty("otherFee")
    private Double otherFee;

    @JsonProperty("netProfit")
    private Double netProfit;

    @JsonProperty("tType")
    private String tType;

    @JsonProperty("tPending")
    private Boolean tPending;

    @JsonProperty("tProfit")
    private Double tProfit;

    @JsonProperty("tGroupId")
    private String tGroupId;

    /** 毫秒时间戳，对齐 Node 端 new Date(created_at).getTime() */
    @JsonProperty("createdAt")
    private Long createdAt;
}
