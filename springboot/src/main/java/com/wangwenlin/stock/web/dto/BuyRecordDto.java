package com.wangwenlin.stock.web.dto;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

/**
 * 买入记录响应体。字段名与 Node 端 getBuyRecords() 的返回键逐一对齐（前端依赖）。
 */
@Data
@JsonAutoDetect(fieldVisibility = JsonAutoDetect.Visibility.ANY,
        getterVisibility = JsonAutoDetect.Visibility.NONE,
        isGetterVisibility = JsonAutoDetect.Visibility.NONE,
        setterVisibility = JsonAutoDetect.Visibility.NONE)
public class BuyRecordDto {

    @JsonProperty("id")
    private String id;

    @JsonProperty("buyDate")
    private String buyDate;

    @JsonProperty("buyPrice")
    private Double buyPrice;

    @JsonProperty("buyCount")
    private Double buyCount;

    @JsonProperty("commission")
    private Double commission;

    @JsonProperty("transferFee")
    private Double transferFee;

    @JsonProperty("handlingFee")
    private Double handlingFee;

    @JsonProperty("regulatoryFee")
    private Double regulatoryFee;

    @JsonProperty("tType")
    private String tType;

    @JsonProperty("tProfit")
    private Double tProfit;

    @JsonProperty("costChange")
    private Double costChange;

    @JsonProperty("tGroupId")
    private String tGroupId;

    /** 毫秒时间戳，对齐 Node 端 new Date(created_at).getTime() */
    @JsonProperty("createdAt")
    private Long createdAt;
}
