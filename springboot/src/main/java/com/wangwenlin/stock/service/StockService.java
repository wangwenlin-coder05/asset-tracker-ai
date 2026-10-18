package com.wangwenlin.stock.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.common.Ids;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.mapper.BuyRecordMapper;
import com.wangwenlin.stock.mapper.SellRecordMapper;
import com.wangwenlin.stock.mapper.StockMapper;
import com.wangwenlin.stock.mapper.TxLogMapper;
import com.wangwenlin.stock.model.BuyRecordRow;
import com.wangwenlin.stock.model.SellRecordRow;
import com.wangwenlin.stock.model.StockRow;
import com.wangwenlin.stock.web.dto.BuyRecordDto;
import com.wangwenlin.stock.web.dto.SellRecordDto;
import com.wangwenlin.stock.web.dto.StockDto;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * /api/stocks 模块业务实现 —— 与 Node 端 server.js 中同名前缀路由逐行对齐。
 * 所有 SQL 均不显式携带 user_id，由租户拦截器自动注入。
 */
@Service
public class StockService {

    private static final DateTimeFormatter TIMESTAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final ZoneId ZONE = ZoneId.of("+08:00");

    /** 与 Node 端 PUT /api/stocks/:id 的白名单一致（顺序亦一致） */
    private static final List<String> STOCK_UPDATABLE = List.of(
            "name", "code", "buyDate", "sellDate", "buyPrice", "cost", "count", "sellPrice", "position",
            "targetProfit", "profitLossRatio", "ratioPrice", "basePrice", "priceChangePercent", "isCleared",
            "notes", "frozenHoldingDays", "topTenFloatRatio");
    /** 与 Node 端 PUT /api/stocks/:id/sell-record/:recordId 的 allowedFields 一致 */
    private static final List<String> SELL_UPDATABLE = List.of(
            "sellDate", "sellPrice", "sellCount", "sellCommission", "sellTransferFee", "stampTax",
            "netProfit", "tType", "tProfit", "tPending", "tGroupId");
    /** 与 Node 端 PUT /api/stocks/:id/buy-record/:recordId 的 allowedFields 一致 */
    private static final List<String> BUY_UPDATABLE = List.of(
            "buyDate", "buyPrice", "buyCount", "commission", "transferFee", "handlingFee",
            "regulatoryFee", "tType", "tProfit", "costChange", "tGroupId");

    private final StockMapper stockMapper;
    private final BuyRecordMapper buyRecordMapper;
    private final SellRecordMapper sellRecordMapper;
    private final TxLogMapper txLogMapper;
    private final ObjectMapper objectMapper;

    public StockService(StockMapper stockMapper, BuyRecordMapper buyRecordMapper,
                        SellRecordMapper sellRecordMapper, TxLogMapper txLogMapper, ObjectMapper objectMapper) {
        this.stockMapper = stockMapper;
        this.buyRecordMapper = buyRecordMapper;
        this.sellRecordMapper = sellRecordMapper;
        this.txLogMapper = txLogMapper;
        this.objectMapper = objectMapper;
    }

    // ==================== 查询 ====================

    public List<StockDto> listStocks(String board) {
        String targetBoard = JsValues.truthy(board) ? board : "stock";
        List<StockRow> rows = stockMapper.listByBoard(targetBoard);

        Map<String, List<BuyRecordDto>> buyMap = new LinkedHashMap<>();
        Map<String, List<SellRecordDto>> sellMap = new LinkedHashMap<>();
        List<String> stockIds = new ArrayList<>(rows.size());
        for (StockRow row : rows) {
            stockIds.add(row.getId());
        }
        if (!stockIds.isEmpty()) {
            for (BuyRecordRow record : buyRecordMapper.listByStockIds(stockIds)) {
                buyMap.computeIfAbsent(record.getStockId(), key -> new ArrayList<>()).add(toBuyDto(record));
            }
            for (SellRecordRow record : sellRecordMapper.listByStockIds(stockIds)) {
                sellMap.computeIfAbsent(record.getStockId(), key -> new ArrayList<>()).add(toSellDto(record));
            }
        }

        List<StockDto> result = new ArrayList<>(rows.size());
        for (StockRow row : rows) {
            List<SellRecordDto> sellRecords = sellMap.getOrDefault(row.getId(), List.of());
            List<BuyRecordDto> buyRecords = buyMap.getOrDefault(row.getId(), List.of());
            result.add(assemble(row, buyRecords, sellRecords));
        }
        return result;
    }

    public StockDto getStock(String id) {
        StockRow row = stockMapper.findById(id);
        if (row == null) {
            throw ApiException.notFound("Stock not found");
        }
        return assemble(row, listBuyRecordDtos(id), listSellRecordDtos(id));
    }

    private StockDto assemble(StockRow row, List<BuyRecordDto> buyRecords, List<SellRecordDto> sellRecords) {
        StockDto dto = new StockDto();
        dto.setId(row.getId());
        dto.setName(row.getName());
        dto.setCode(row.getCode());
        dto.setBoard(JsValues.orDefault(row.getBoard(), "stock"));

        String stockBuyDate = !buyRecords.isEmpty() ? buyRecords.get(0).getBuyDate() : JsValues.orEmpty(row.getBuyDateStr());
        dto.setBuyDate(stockBuyDate);

        // 对齐 Node：DECIMAL 列经 mysql2 返回为字符串，parseFloat(null) → NaN → JSON null（而非 0）
        Double rowBuyPrice = jsParse(row.getBuyPrice());
        Double rowCost = jsParse(row.getCost());
        Double rowCount = jsParse(row.getCount());
        Double buyPrice = rowBuyPrice;
        Double cost = rowCost;
        Double count = rowCount;
        if (!buyRecords.isEmpty()) {
            CostBasis basis = CostBasis.calculate(buyRecords, sellRecords,
                    rowCost == null ? 0d : rowCost, rowCount == null ? 0d : rowCount);
            buyPrice = CostBasis.round(basis.averageBuyPrice(), 3);
            cost = CostBasis.round(basis.averageCost(), 3);
            count = CostBasis.round(basis.remainingCount(), 4);
        }

        String sellDate = JsValues.orEmpty(row.getSellDateStr());
        boolean cleared = isCleared(row);
        if (cleared && sellDate.isEmpty() && !sellRecords.isEmpty()) {
            sellDate = JsValues.orEmpty(sellRecords.get(sellRecords.size() - 1).getSellDate());
        }

        dto.setSellDate(sellDate);
        dto.setBuyPrice(buyPrice);
        dto.setCost(cost);
        dto.setCount(count);
        // 对齐 Node：sell_price 为 DECIMAL 且可空，parseFloat(NULL) → null
        dto.setSellPrice(jsParse(row.getSellPrice()));
        dto.setPosition(row.getPosition());
        dto.setTargetProfit(row.getTargetProfit() == null ? null : row.getTargetProfit().doubleValue());
        dto.setProfitLossRatio(row.getProfitLossRatio() == null ? null : row.getProfitLossRatio().doubleValue());
        dto.setRatioPrice(row.getRatioPrice() == null ? null : row.getRatioPrice().doubleValue());
        dto.setBasePrice(row.getBasePrice() == null ? null : row.getBasePrice().doubleValue());
        dto.setPriceChangePercent(row.getPriceChangePercent() == null ? null : row.getPriceChangePercent().doubleValue());
        dto.setIsCleared(cleared);
        dto.setNotes(JsValues.orEmpty(row.getNotes()));
        dto.setFrozenHoldingDays(cleared ? (row.getFrozenHoldingDays() == null ? 0 : row.getFrozenHoldingDays()) : 0);
        dto.setTopTenFloatRatio(row.getTopTenFloatRatio() == null ? null : row.getTopTenFloatRatio().doubleValue());
        dto.setSellRecords(sellRecords);
        dto.setBuyRecords(buyRecords);
        return dto;
    }

    private static boolean isCleared(StockRow row) {
        return row.getIsCleared() != null && row.getIsCleared() == 1;
    }

    public List<SellRecordDto> listSellRecordDtos(String stockId) {
        List<SellRecordDto> result = new ArrayList<>();
        for (SellRecordRow record : sellRecordMapper.listByStockId(stockId)) {
            result.add(toSellDto(record));
        }
        return result;
    }

    public List<BuyRecordDto> listBuyRecordDtos(String stockId) {
        List<BuyRecordDto> result = new ArrayList<>();
        for (BuyRecordRow record : buyRecordMapper.listByStockId(stockId)) {
            result.add(toBuyDto(record));
        }
        return result;
    }

    // ==================== 卖出记录 ====================

    public Map<String, Object> createSellRecord(String stockId, Map<String, Object> body) {
        Double sellPrice = JsValues.parse(body.get("sellPrice"));
        Double sellCount = JsValues.parse(body.get("sellCount"));
        Double sellCommission = JsValues.parse(body.getOrDefault("sellCommission", 0));
        if (sellPrice == null || sellPrice <= 0) {
            throw ApiException.badRequest("买入单价必须大于 0");
        }
        if (sellCount == null || sellCount <= 0) {
            throw ApiException.badRequest("买入克数必须大于 0");
        }
        if (sellCommission == null || sellCommission < 0) {
            throw ApiException.badRequest("????????? 0");
        }
        if (stockMapper.findById(stockId) == null) {
            throw ApiException.notFound("??????????????????");
        }

        String recordId = Ids.genId();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", recordId);
        data.put("stockId", stockId);
        data.put("sellDate", JsValues.truthyOrNull(body.get("sellDate")));
        data.put("sellPrice", sellPrice);
        data.put("sellCount", sellCount);
        data.put("position", JsValues.orEmpty(body.get("position")));
        data.put("sellCommission", sellCommission);
        data.put("sellTransferFee", JsValues.parseOrZero(body.getOrDefault("sellTransferFee", 0)));
        data.put("stampTax", JsValues.parseOrZero(body.getOrDefault("stampTax", 0)));
        data.put("handlingFee", JsValues.parseOrZero(body.getOrDefault("handlingFee", 0)));
        data.put("regulatoryFee", JsValues.parseOrZero(body.getOrDefault("regulatoryFee", 0)));
        data.put("otherFee", JsValues.parseOrZero(body.getOrDefault("otherFee", 0)));
        data.put("netProfit", JsValues.parseOrZero(body.getOrDefault("netProfit", 0)));
        data.put("tType", JsValues.orEmpty(body.get("tType")));
        data.put("tProfit", body.get("tProfit") == null ? null : JsValues.parse(body.get("tProfit")));
        data.put("tPending", JsValues.truthy(body.get("tPending")) ? 1 : 0);
        data.put("tGroupId", JsValues.truthyStringOrNull(body.get("tGroupId")));
        sellRecordMapper.insertRecord(data);
        return Map.of("id", recordId);
    }

    public Map<String, Object> deleteSellRecord(String stockId, String recordId) {
        sellRecordMapper.deleteById(recordId);
        return Map.of("success", true);
    }

    public Map<String, Object> updateSellRecord(String stockId, String recordId, Map<String, Object> body) {
        Map<String, Object> data = new LinkedHashMap<>();
        for (String key : SELL_UPDATABLE) {
            if (!body.containsKey(key)) {
                continue;
            }
            Object value = body.get(key);
            if ("sellDate".equals(key) && "".equals(value)) {
                data.put(key, null);
            } else if ("tPending".equals(key)) {
                data.put(key, JsValues.truthy(value) ? 1 : 0);
            } else {
                data.put(key, value);
            }
        }
        if (data.isEmpty()) {
            return Map.of("success", true);
        }
        data.put("id", recordId);
        sellRecordMapper.updateFields(data);
        return Map.of("success", true);
    }

    // ==================== 买入记录 ====================

    @Transactional
    public Map<String, Object> createBuyRecord(String stockId, Map<String, Object> body) {
        Object rawDate = body.get("buyDate");
        String buyDate = (rawDate instanceof String text && text.matches("\\d{4}-\\d{2}-\\d{2}")) ? text : null;
        double buyPrice = JsValues.parseOrZero(body.get("buyPrice"));
        double buyCount = JsValues.parseOrZero(body.get("buyCount"));
        if (buyDate == null) {
            throw ApiException.badRequest("请选择有效的买入日期");
        }
        if (buyPrice <= 0) {
            throw ApiException.badRequest("???????? 0");
        }
        if (buyCount <= 0) {
            throw ApiException.badRequest("???????? 0");
        }

        if (stockMapper.lockById(stockId) == null) {
            throw ApiException.notFound("黄金项目不存在");
        }

        String recordId = Ids.genId();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", recordId);
        data.put("stockId", stockId);
        data.put("buyDate", buyDate);
        data.put("buyPrice", buyPrice);
        data.put("buyCount", buyCount);
        data.put("commission", JsValues.parseOrZero(body.get("commission")));
        data.put("transferFee", JsValues.parseOrZero(body.get("transferFee")));
        data.put("handlingFee", JsValues.parseOrZero(body.get("handlingFee")));
        data.put("regulatoryFee", JsValues.parseOrZero(body.get("regulatoryFee")));
        data.put("tType", body.get("tType") instanceof String text ? text : "");
        data.put("tProfit", body.get("tProfit") == null || "".equals(body.get("tProfit"))
                ? null : JsValues.parseOrZero(body.get("tProfit")));
        data.put("costChange", JsValues.parseOrZero(body.get("costChange")));
        data.put("tGroupId", body.get("tGroupId") == null || "".equals(body.get("tGroupId"))
                ? null : String.valueOf(body.get("tGroupId")));

        stockMapper.reactivateForBuy(stockId);
        buyRecordMapper.insertRecord(data);
        return Map.of("id", recordId);
    }

    public Map<String, Object> deleteBuyRecord(String stockId, String recordId) {
        buyRecordMapper.deleteById(recordId);
        return Map.of("success", true);
    }

    public Map<String, Object> updateBuyRecord(String stockId, String recordId, Map<String, Object> body) {
        Map<String, Object> data = new LinkedHashMap<>();
        for (String key : BUY_UPDATABLE) {
            if (!body.containsKey(key)) {
                continue;
            }
            Object value = body.get(key);
            if ("buyDate".equals(key) && "".equals(value)) {
                data.put(key, null);
            } else {
                data.put(key, value);
            }
        }
        if (data.isEmpty()) {
            return Map.of("success", true);
        }
        data.put("id", recordId);
        buyRecordMapper.updateFields(data);
        return Map.of("success", true);
    }

    // ==================== 股票 ====================

    public Map<String, Object> createStock(Map<String, Object> body) {
        String finalBoard = JsValues.orDefault(body.get("board"), "stock");
        Object rawCode = body.get("code");
        String finalCode = (rawCode == null ? "" : String.valueOf(rawCode)).trim();

        if (!finalCode.isEmpty()) {
            Map<String, Object> existing = stockMapper.findReusableByCode(finalCode, finalBoard);
            if (existing != null) {
                String existingId = String.valueOf(existing.get("id"));
                Object existingName = existing.get("name");
                Object existingCleared = existing.get("is_cleared");
                if (existingCleared instanceof Number number && number.intValue() == 1) {
                    stockMapper.reactivate(existingId, JsValues.orDefault(body.get("position"), "full"));
                }
                Object name = body.get("name");
                if (JsValues.truthy(name) && !String.valueOf(name).equals(String.valueOf(existingName))) {
                    stockMapper.updateName(existingId, String.valueOf(name));
                }
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("id", existingId);
                result.put("reused", true);
                result.put("name", JsValues.truthy(name) ? name : existingName);
                return result;
            }
        }

        String id = Ids.genId();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", id);
        data.put("name", body.get("name"));
        data.put("code", body.get("code"));
        data.put("cost", body.get("cost"));
        data.put("count", body.get("count"));
        data.put("sellPrice", JsValues.truthyOrNull(body.get("sellPrice")));
        data.put("position", JsValues.orDefault(body.get("position"), "full"));
        data.put("buyDate", JsValues.truthyOrNull(body.get("buyDate")));
        data.put("buyPrice", JsValues.truthyOrNull(body.get("buyPrice")));
        data.put("board", finalBoard);
        data.put("targetProfit", JsValues.truthyOrNull(body.get("targetProfit")));
        stockMapper.insertStock(data);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", id);
        result.put("reused", false);
        return result;
    }

    public Map<String, Object> updateStock(String id, Map<String, Object> body) {
        Map<String, Object> data = new LinkedHashMap<>();
        for (String key : STOCK_UPDATABLE) {
            if (!body.containsKey(key)) {
                continue;
            }
            Object value = body.get(key);
            if ("isCleared".equals(key)) {
                data.put(key, JsValues.truthy(value) ? 1 : 0);
            } else if (("buyDate".equals(key) || "sellDate".equals(key)) && "".equals(value)) {
                data.put(key, null);
            } else {
                data.put(key, value);
            }
        }
        if (data.isEmpty()) {
            return Map.of("success", true);
        }
        data.put("id", id);
        stockMapper.updateFields(data);
        return Map.of("success", true);
    }

    public Map<String, Object> clearStock(String id) {
        stockMapper.clearStock(id);
        return Map.of("success", true);
    }

    public Map<String, Object> deleteStock(String id) {
        stockMapper.deleteById(id);
        return Map.of("success", true);
    }

    // ==================== 交易日志 ====================

    public Map<String, Object> createTxLog(Map<String, Object> body) {
        String stockId = truncate(String.valueOf(body.getOrDefault("stockId", "")), 64);
        String stockCode = truncate(String.valueOf(body.getOrDefault("stockCode", "")), 32);
        String action = truncate(String.valueOf(body.getOrDefault("action", "")), 32);
        // 对齐 tenant-db.js validateRelations：tx_logs.stock_id → stocks 必须在当前租户内存在。
        // Node 端该校验由租户代理抛出、并被路由的统一 catch 转成 500，此处保持一致。
        if (JsValues.truthy(stockId) && stockMapper.existsById(stockId) == null) {
            throw new ApiException(500, "关联记录不存在或不属于当前账号");
        }
        Object detail = JsValues.truthy(body.get("detail")) ? body.get("detail") : Map.of();
        String detailJson;
        try {
            detailJson = objectMapper.writeValueAsString(detail);
        } catch (JsonProcessingException e) {
            detailJson = "{}";
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("stockId", stockId);
        data.put("stockCode", stockCode);
        data.put("action", action);
        data.put("beforeCount", JsValues.parseOrZero(body.get("beforeCount")));
        data.put("afterCount", JsValues.parseOrZero(body.get("afterCount")));
        data.put("totalBuy", JsValues.parseOrZero(body.get("totalBuy")));
        data.put("totalSell", JsValues.parseOrZero(body.get("totalSell")));
        data.put("tradeCount", JsValues.parseOrZero(body.get("tradeCount")));
        data.put("detail", detailJson);
        txLogMapper.insertLog(data);
        return Map.of("ok", true);
    }

    public Map<String, Object> listTxLogs(String limitParam, String offsetParam) {
        int limit = Math.min(parseIntOrDefault(limitParam, 50), 200);
        int offset = Math.max(parseIntOrDefault(offsetParam, 0), 0);
        List<Map<String, Object>> logs = new ArrayList<>();
        for (Map<String, Object> row : txLogMapper.list(limit, offset)) {
            logs.add(normalizeTxLogRow(row));
        }
        Long total = txLogMapper.count();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("logs", logs);
        result.put("total", total == null ? 0L : total);
        return result;
    }

    /**
     * 对齐 Node 端的 JSON 形态：mysql2 把 DOUBLE 列作为 JS number 输出（2.0 → 2），
     * 且 datetime(3) 以 "YYYY-MM-DD HH:MM:SS.mmm" 字符串返回。
     */
    private static Map<String, Object> normalizeTxLogRow(Map<String, Object> row) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : row.entrySet()) {
            String key = entry.getKey();
            Object value = entry.getValue();
            if (value instanceof String text && "created_at".equals(key)) {
                out.put(key, text.length() > 23 ? text.substring(0, 23) : text);
            } else {
                out.put(key, jsNumber(value));
            }
        }
        return out;
    }

    /** JS 只有一种 number：整数值输出为 2 而不是 2.0。 */
    private static Object jsNumber(Object value) {
        if (value instanceof Double number) {
            if (Double.isFinite(number) && number == Math.rint(number) && Math.abs(number) < 9.007199254740992E15) {
                return number.longValue();
            }
            return number;
        }
        if (value instanceof BigDecimal decimal) {
            return jsNumber(decimal.doubleValue());
        }
        return value;
    }

    // ==================== 映射与工具 ====================

    private static SellRecordDto toSellDto(SellRecordRow row) {
        SellRecordDto dto = new SellRecordDto();
        dto.setId(row.getId());
        dto.setSellDate(JsValues.orEmpty(row.getSellDateStr()));
        dto.setSellPrice(jsParse(row.getSellPrice()));
        dto.setSellCount(jsParse(row.getSellCount()));
        dto.setPosition(row.getPosition());
        dto.setSellCommission(jsParse(row.getSellCommission()));
        dto.setSellTransferFee(jsParse(row.getSellTransferFee()));
        dto.setStampTax(jsParse(row.getStampTax()));
        dto.setHandlingFee(jsParse(row.getHandlingFee()));
        dto.setRegulatoryFee(jsParse(row.getRegulatoryFee()));
        dto.setOtherFee(jsParse(row.getOtherFee()));
        dto.setNetProfit(jsParse(row.getNetProfit()));
        dto.setTType(JsValues.orEmpty(row.getTType()));
        dto.setTPending(row.getTPending() != null && row.getTPending() == 1);
        dto.setTProfit(row.getTProfit() == null ? null : row.getTProfit().doubleValue());
        dto.setTGroupId(row.getTGroupId());
        dto.setCreatedAt(toEpochMillis(row.getCreatedAtStr()));
        return dto;
    }

    private static BuyRecordDto toBuyDto(BuyRecordRow row) {
        BuyRecordDto dto = new BuyRecordDto();
        dto.setId(row.getId());
        dto.setBuyDate(JsValues.orEmpty(row.getBuyDateStr()));
        dto.setBuyPrice(jsParse(row.getBuyPrice()));
        dto.setBuyCount(jsParse(row.getBuyCount()));
        dto.setCommission(jsParse(row.getCommission()));
        dto.setTransferFee(jsParse(row.getTransferFee()));
        dto.setHandlingFee(jsParse(row.getHandlingFee()));
        dto.setRegulatoryFee(jsParse(row.getRegulatoryFee()));
        dto.setTType(JsValues.orEmpty(row.getTType()));
        dto.setTProfit(row.getTProfit() == null ? null : row.getTProfit().doubleValue());
        // 对齐 Node：cost_change != null ? parseFloat : 0
        dto.setCostChange(row.getCostChange() == null ? 0d : row.getCostChange().doubleValue());
        dto.setTGroupId(row.getTGroupId());
        dto.setCreatedAt(toEpochMillis(row.getCreatedAtStr()));
        return dto;
    }

    /**
     * 等价于 {parseFloat(r.column)}：mysql2 对 DECIMAL 返回字符串，NULL 时 parseFloat(null) 为 NaN，
     * 经 JSON.stringify 后变为 null。因此 NULL → null，其余 → 数值。
     */
    private static Double jsParse(BigDecimal value) {
        return value == null ? null : value.doubleValue();
    }

    private static long toEpochMillis(String timestamp) {
        if (timestamp == null || timestamp.isEmpty()) {
            return 0L;
        }
        try {
            return LocalDateTime.parse(timestamp, TIMESTAMP).atZone(ZONE).toInstant().toEpochMilli();
        } catch (Exception e) {
            return 0L;
        }
    }

    /** 对齐 JS parseInt()：非法输入返回 NaN（此处以 fallback 表达 || 默认值语义）。 */
    private static int parseIntOrDefault(String value, int fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        String trimmed = value.trim();
        int index = 0;
        int sign = 1;
        if (trimmed.startsWith("-")) {
            sign = -1;
            index = 1;
        } else if (trimmed.startsWith("+")) {
            index = 1;
        }
        int start = index;
        long result = 0L;
        while (index < trimmed.length() && Character.isDigit(trimmed.charAt(index))) {
            result = result * 10 + (trimmed.charAt(index) - '0');
            index++;
        }
        if (index == start) {
            return fallback;
        }
        int parsed = (int) (sign * result);
        return parsed == 0 ? fallback : parsed;
    }

    private static String truncate(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max);
    }
}
