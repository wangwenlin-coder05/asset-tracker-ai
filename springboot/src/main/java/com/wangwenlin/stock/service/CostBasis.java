package com.wangwenlin.stock.service;

import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.web.dto.BuyRecordDto;
import com.wangwenlin.stock.web.dto.SellRecordDto;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * 与 Node 端 calculateStockCostBasis() 逐行等价的成本摊薄计算。
 */
public final class CostBasis {

    private final double averageBuyPrice;
    private final double averageCost;
    private final double remainingCount;
    private final double remainingCostTotal;

    private CostBasis(double averageBuyPrice, double averageCost, double remainingCount, double remainingCostTotal) {
        this.averageBuyPrice = averageBuyPrice;
        this.averageCost = averageCost;
        this.remainingCount = remainingCount;
        this.remainingCostTotal = remainingCostTotal;
    }

    public double averageBuyPrice() {
        return averageBuyPrice;
    }

    public double averageCost() {
        return averageCost;
    }

    public double remainingCount() {
        return remainingCount;
    }

    public double remainingCostTotal() {
        return remainingCostTotal;
    }

    public static CostBasis calculate(List<BuyRecordDto> buyRecords, List<SellRecordDto> sellRecords,
                                      double fallbackCost, double fallbackCount) {
        double totalBuyCount = 0d;
        double totalBuyAmount = 0d;
        for (BuyRecordDto record : buyRecords) {
            double count = JsValues.parseOrZero(record.getBuyCount());
            double price = JsValues.parseOrZero(record.getBuyPrice());
            totalBuyCount += count;
            totalBuyAmount += price * count;
        }
        double totalBuyGross = totalBuyAmount + sumOf(buyRecords, CostBasis::buyFee);

        double totalSellCount = 0d;
        for (SellRecordDto record : sellRecords) {
            totalSellCount += JsValues.parseOrZero(record.getSellCount());
        }
        double totalSellNet = 0d;
        for (SellRecordDto record : sellRecords) {
            totalSellNet += JsValues.parseOrZero(record.getSellPrice()) * JsValues.parseOrZero(record.getSellCount())
                    - sellFee(record);
        }

        double remainingCount = Math.max(0d, totalBuyCount - totalSellCount);
        double fallbackAverageCost = fallbackCost;
        double averageBuyPrice = totalBuyCount > 0d ? totalBuyAmount / totalBuyCount : fallbackAverageCost;
        double averageBuyCost = totalBuyCount > 0d ? totalBuyGross / totalBuyCount : fallbackAverageCost;
        double remainingCostTotal = totalBuyGross - totalSellNet;
        double averageCost = remainingCount > 0d ? remainingCostTotal / remainingCount : averageBuyCost;
        double effectiveRemaining = !buyRecords.isEmpty() ? remainingCount : Math.max(0d, fallbackCount);
        double effectiveCostTotal = remainingCount > 0d ? remainingCostTotal : 0d;
        return new CostBasis(averageBuyPrice, averageCost, effectiveRemaining, effectiveCostTotal);
    }

    /** 对齐 Node 端 parseFloat(x.toFixed(scale))。 */
    public static double round(double value, int scale) {
        if (!Double.isFinite(value)) {
            return 0d;
        }
        return BigDecimal.valueOf(value).setScale(scale, RoundingMode.HALF_UP).doubleValue();
    }

    private static double buyFee(BuyRecordDto record) {
        return JsValues.parseOrZero(record.getCommission())
                + JsValues.parseOrZero(record.getTransferFee())
                + JsValues.parseOrZero(record.getHandlingFee())
                + JsValues.parseOrZero(record.getRegulatoryFee());
    }

    private static double sellFee(SellRecordDto record) {
        return JsValues.parseOrZero(record.getSellCommission())
                + JsValues.parseOrZero(record.getSellTransferFee())
                + JsValues.parseOrZero(record.getStampTax())
                + JsValues.parseOrZero(record.getHandlingFee())
                + JsValues.parseOrZero(record.getRegulatoryFee())
                + JsValues.parseOrZero(record.getOtherFee());
    }

    private static double sumOf(List<BuyRecordDto> records, java.util.function.ToDoubleFunction<BuyRecordDto> mapper) {
        double total = 0d;
        for (BuyRecordDto record : records) {
            total += mapper.applyAsDouble(record);
        }
        return total;
    }
}
