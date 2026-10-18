package com.wangwenlin.stock.web.dto;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.util.List;

/**
 * 股票响应体。字段名与 Node 端 GET /api/stocks 的返回键逐一对齐（前端依赖）。
 */
@Data
@JsonAutoDetect(fieldVisibility = JsonAutoDetect.Visibility.ANY,
        getterVisibility = JsonAutoDetect.Visibility.NONE,
        isGetterVisibility = JsonAutoDetect.Visibility.NONE,
        setterVisibility = JsonAutoDetect.Visibility.NONE)
public class StockDto {

    @JsonProperty("id")
    private String id;

    @JsonProperty("name")
    private String name;

    @JsonProperty("code")
    private String code;

    @JsonProperty("board")
    private String board;

    @JsonProperty("buyDate")
    private String buyDate;

    @JsonProperty("sellDate")
    private String sellDate;

    @JsonProperty("buyPrice")
    private Double buyPrice;

    @JsonProperty("cost")
    private Double cost;

    @JsonProperty("count")
    private Double count;

    @JsonProperty("sellPrice")
    private Double sellPrice;

    @JsonProperty("position")
    private String position;

    @JsonProperty("targetProfit")
    private Double targetProfit;

    @JsonProperty("profitLossRatio")
    private Double profitLossRatio;

    @JsonProperty("ratioPrice")
    private Double ratioPrice;

    @JsonProperty("basePrice")
    private Double basePrice;

    @JsonProperty("priceChangePercent")
    private Double priceChangePercent;

    @JsonProperty("isCleared")
    private Boolean isCleared;

    @JsonProperty("notes")
    private String notes;

    @JsonProperty("frozenHoldingDays")
    private Integer frozenHoldingDays;

    @JsonProperty("topTenFloatRatio")
    private Double topTenFloatRatio;

    @JsonProperty("sellRecords")
    private List<SellRecordDto> sellRecords;

    @JsonProperty("buyRecords")
    private List<BuyRecordDto> buyRecords;
}
