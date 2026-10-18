package com.wangwenlin.stock.service;

import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.common.Ids;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.mapper.StockDailyAnalysisMapper;
import com.wangwenlin.stock.mapper.StockWatchlistMapper;
import com.wangwenlin.stock.model.StockDailyAnalysisRow;
import com.wangwenlin.stock.model.StockWatchlistRow;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * /api/stock/watchlist 模块 —— 与 Node 端 server.js 同名路由逐行对齐（6 个路由）。
 */
@Service
public class StockWatchlistService {

    private final StockWatchlistMapper watchlistMapper;
    private final StockDailyAnalysisMapper analysisMapper;

    public StockWatchlistService(StockWatchlistMapper watchlistMapper, StockDailyAnalysisMapper analysisMapper) {
        this.watchlistMapper = watchlistMapper;
        this.analysisMapper = analysisMapper;
    }

    // ==================== 观察列表 ====================

    public List<Map<String, Object>> list() {
        List<StockWatchlistRow> rows = watchlistMapper.list();

        Map<String, List<Map<String, Object>>> analysisMap = new HashMap<>();
        if (!rows.isEmpty()) {
            List<String> watchIds = new ArrayList<>(rows.size());
            for (StockWatchlistRow row : rows) {
                watchIds.add(row.getId());
            }
            for (StockDailyAnalysisRow row : analysisMapper.listByWatchIds(watchIds)) {
                analysisMap.computeIfAbsent(row.getWatchId(), key -> new ArrayList<>()).add(analysisView(row));
            }
        }

        List<Map<String, Object>> result = new ArrayList<>(rows.size());
        for (StockWatchlistRow row : rows) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", row.getId());
            item.put("code", row.getCode());
            item.put("name", row.getName());
            item.put("isHolding", JsValues.truthy(row.getIsHolding()));
            item.put("pinned", JsValues.truthy(row.getPinned()));
            item.put("sortOrder", row.getSortOrder() == null ? 0 : row.getSortOrder());
            item.put("createdAt", row.getCreatedAt());
            item.put("updatedAt", row.getUpdatedAt());
            item.put("analyses", analysisMap.getOrDefault(row.getId(), List.of()));
            result.add(item);
        }
        return result;
    }

    public Map<String, Object> create(Map<String, Object> body) {
        Object code = body.get("code");
        if (!JsValues.truthy(code)) {
            throw ApiException.badRequest("代码不能为空");
        }
        Object name = JsValues.truthy(body.get("name")) ? body.get("name") : code;
        boolean isHolding = JsValues.truthy(body.get("isHolding"));
        String id = Ids.uuid();
        long now = System.currentTimeMillis();

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", id);
        data.put("code", code);
        data.put("name", name);
        data.put("isHolding", isHolding ? 1 : 0);
        data.put("createdAt", now);
        data.put("updatedAt", now);
        watchlistMapper.insert(data);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", id);
        result.put("code", code);
        result.put("name", name);
        result.put("isHolding", isHolding);
        result.put("pinned", false);
        result.put("sortOrder", 0);
        result.put("createdAt", now);
        result.put("updatedAt", now);
        result.put("analyses", List.of());
        return result;
    }

    public Map<String, Object> update(String id, Map<String, Object> body) {
        Map<String, Object> data = new LinkedHashMap<>();
        if (body.containsKey("pinned")) {
            data.put("pinned", JsValues.truthy(body.get("pinned")) ? 1 : 0);
        }
        if (body.containsKey("sortOrder")) {
            data.put("sortOrder", body.get("sortOrder"));
        }
        if (body.containsKey("name")) {
            data.put("name", body.get("name"));
        }
        if (body.containsKey("isHolding")) {
            data.put("isHolding", JsValues.truthy(body.get("isHolding")) ? 1 : 0);
        }
        if (data.isEmpty()) {
            return Map.of("ok", true);
        }
        data.put("updatedAt", System.currentTimeMillis());
        data.put("id", id);
        watchlistMapper.updateFields(data);
        return Map.of("ok", true);
    }

    public Map<String, Object> delete(String id) {
        watchlistMapper.deleteById(id);
        analysisMapper.deleteByWatchId(id);
        return Map.of("ok", true);
    }

    // ==================== 每日分析 ====================

    public Map<String, Object> saveAnalysis(String watchId, Map<String, Object> body) {
        Object date = body.get("date");
        if (!JsValues.truthy(date)) {
            throw ApiException.badRequest("日期不能为空");
        }

        List<Map<String, Object>> existing = analysisMapper.findIdsByWatchAndDate(watchId, date);
        long now = System.currentTimeMillis();

        if (!existing.isEmpty()) {
            String existingId = String.valueOf(existing.get(0).get("id"));
            Map<String, Object> data = new LinkedHashMap<>();
            if (body.containsKey("actionType")) {
                data.put("actionType", JsValues.orEmptyValue(body.get("actionType")));
            }
            if (body.containsKey("sentiment")) {
                data.put("sentiment", JsValues.orEmptyValue(body.get("sentiment")));
            }
            if (body.containsKey("targetBuyPrice")) {
                data.put("targetBuyPrice", JsValues.truthyOrNull(body.get("targetBuyPrice")));
            }
            if (body.containsKey("targetBuyPriceHigh")) {
                data.put("targetBuyPriceHigh", JsValues.truthyOrNull(body.get("targetBuyPriceHigh")));
            }
            if (body.containsKey("targetSellPrice")) {
                data.put("targetSellPrice", JsValues.truthyOrNull(body.get("targetSellPrice")));
            }
            if (body.containsKey("targetSellPriceHigh")) {
                data.put("targetSellPriceHigh", JsValues.truthyOrNull(body.get("targetSellPriceHigh")));
            }
            if (body.containsKey("stopLossPrice")) {
                data.put("stopLossPrice", JsValues.truthyOrNull(body.get("stopLossPrice")));
            }
            if (body.containsKey("stopLossPriceHigh")) {
                data.put("stopLossPriceHigh", JsValues.truthyOrNull(body.get("stopLossPriceHigh")));
            }
            if (body.containsKey("buyShareCount")) {
                data.put("buyShareCount", shareValue(body.get("buyShareCount")));
            }
            if (body.containsKey("sellShareCount")) {
                data.put("sellShareCount", shareValue(body.get("sellShareCount")));
            }
            if (body.containsKey("lossShareCount")) {
                data.put("lossShareCount", shareValue(body.get("lossShareCount")));
            }
            if (body.containsKey("note")) {
                data.put("note", JsValues.orEmptyValue(body.get("note")));
            }
            if (body.containsKey("nextDayNote")) {
                data.put("nextDayNote", JsValues.orEmptyValue(body.get("nextDayNote")));
            }
            if (body.containsKey("reviewResult")) {
                data.put("reviewResult", JsValues.orEmptyValue(body.get("reviewResult")));
            }
            if (body.containsKey("reviewNote")) {
                data.put("reviewNote", JsValues.orEmptyValue(body.get("reviewNote")));
            }
            if (data.isEmpty()) {
                return Map.of("ok", true);
            }
            data.put("updatedAt", now);
            data.put("id", existingId);
            analysisMapper.updateFields(data);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("ok", true);
            result.put("id", existingId);
            return result;
        }

        // 对齐 Node 端 tenant-db.js 的 RELATIONS 校验（watch_id → stock_watchlist 必须属于当前账号），
        // 同时取回该行 code —— Node 端用的是同一张表上的子查询。
        // 校验失败在 Node 端被路由的统一 catch 转成 500「保存失败」，此处保持一致。
        String code = watchlistMapper.findCodeById(watchId);
        if (code == null) {
            throw new ApiException(500, "保存失败");
        }

        String analysisId = Ids.uuid();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", analysisId);
        data.put("watchId", watchId);
        data.put("code", code);
        data.put("date", date);
        data.put("actionType", JsValues.orEmptyValue(body.get("actionType")));
        data.put("sentiment", JsValues.orEmptyValue(body.get("sentiment")));
        data.put("targetBuyPrice", JsValues.truthyOrNull(body.get("targetBuyPrice")));
        data.put("targetBuyPriceHigh", JsValues.truthyOrNull(body.get("targetBuyPriceHigh")));
        data.put("targetSellPrice", JsValues.truthyOrNull(body.get("targetSellPrice")));
        data.put("targetSellPriceHigh", JsValues.truthyOrNull(body.get("targetSellPriceHigh")));
        data.put("stopLossPrice", JsValues.truthyOrNull(body.get("stopLossPrice")));
        data.put("stopLossPriceHigh", JsValues.truthyOrNull(body.get("stopLossPriceHigh")));
        data.put("buyShareCount", shareValue(body.get("buyShareCount")));
        data.put("sellShareCount", shareValue(body.get("sellShareCount")));
        data.put("lossShareCount", shareValue(body.get("lossShareCount")));
        data.put("note", JsValues.orEmptyValue(body.get("note")));
        data.put("nextDayNote", JsValues.orEmptyValue(body.get("nextDayNote")));
        data.put("reviewResult", JsValues.orEmptyValue(body.get("reviewResult")));
        data.put("reviewNote", JsValues.orEmptyValue(body.get("reviewNote")));
        data.put("createdAt", now);
        data.put("updatedAt", now);
        analysisMapper.insert(data);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("id", analysisId);
        return result;
    }

    public Map<String, Object> deleteAnalysis(String watchId, String date) {
        analysisMapper.deleteByWatchIdAndDate(watchId, date);
        return Map.of("ok", true);
    }

    /** 对齐 Node 端 shareVal：Number(v) 有限且 > 0 时向下取整，否则 null。 */
    private static Object shareValue(Object value) {
        Double parsed = JsValues.parse(value);
        if (parsed == null || !(parsed > 0)) {
            return null;
        }
        return (int) Math.floor(parsed);
    }

    private static Map<String, Object> analysisView(StockDailyAnalysisRow row) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("id", row.getId());
        view.put("date", row.getDate());
        view.put("actionType", JsValues.orEmpty(row.getActionType()));
        view.put("sentiment", JsValues.orEmpty(row.getSentiment()));
        view.put("targetBuyPrice", row.getTargetBuyPrice());
        view.put("targetBuyPriceHigh", row.getTargetBuyPriceHigh());
        view.put("targetSellPrice", row.getTargetSellPrice());
        view.put("targetSellPriceHigh", row.getTargetSellPriceHigh());
        view.put("stopLossPrice", row.getStopLossPrice());
        view.put("stopLossPriceHigh", row.getStopLossPriceHigh());
        view.put("buyShareCount", row.getBuyShareCount());
        view.put("sellShareCount", row.getSellShareCount());
        view.put("lossShareCount", row.getLossShareCount());
        view.put("note", JsValues.orEmpty(row.getNote()));
        view.put("nextDayNote", JsValues.orEmpty(row.getNextDayNote()));
        view.put("reviewResult", JsValues.orEmpty(row.getReviewResult()));
        view.put("reviewNote", JsValues.orEmpty(row.getReviewNote()));
        view.put("createdAt", row.getCreatedAt());
        view.put("updatedAt", row.getUpdatedAt());
        return view;
    }
}
