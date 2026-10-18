package com.wangwenlin.stock.web;

import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.mapper.WechatEventMapper;
import com.wangwenlin.stock.mapper.WechatTrackingMapper;
import com.wangwenlin.stock.service.WechatExtractService;
import com.wangwenlin.stock.service.WechatTrackingService;
import com.wangwenlin.stock.tenant.UserContext;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 微信推票追踪相关路由。逐行对齐 server.js 11812-12124、12243-12448、12915-13046。
 */
@RestController
@RequestMapping("/api/wechat")
public class WechatTrackingController {

    private static final Pattern DATE_RE = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");
    private static final Pattern CODE_RE = Pattern.compile("^\\d{6}$");

    private final WechatTrackingService trackingService;
    private final WechatTrackingMapper trackingMapper;
    private final WechatEventMapper eventMapper;
    private final WechatExtractService extractService;

    public WechatTrackingController(WechatTrackingService trackingService,
                                    WechatTrackingMapper trackingMapper,
                                    WechatEventMapper eventMapper,
                                    WechatExtractService extractService) {
        this.trackingService = trackingService;
        this.trackingMapper = trackingMapper;
        this.eventMapper = eventMapper;
        this.extractService = extractService;
    }

    // ==================== GET /api/wechat/tracking ====================

    @GetMapping("/tracking")
    public Map<String, Object> tracking(@RequestParam(value = "sender", required = false) String sender,
                                        @RequestParam(value = "limit", required = false) String limitRaw) {
        Double parsedLimit = jsNumber(limitRaw);
        double limitValue = parsedLimit == null || parsedLimit == 0 ? 100 : parsedLimit;
        Integer limit = (int) Math.min(limitValue, 500);
        String senderTrim = sender == null ? "" : sender.trim();
        return trackingService.getTrackingList(senderTrim, limit);
    }

    // ==================== POST /api/wechat/tracking/manual ====================

    @PostMapping("/tracking/manual")
    public Map<String, Object> addManual(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> payload = body == null ? new LinkedHashMap<>() : body;
        String senderTrim = str(payload.get("sender")).trim();
        String codeTrim = str(payload.get("stockCode")).trim();
        String nameTrim = str(payload.get("stockName")).trim();
        String dateTrim = str(payload.get("pickDate")).trim();
        if (senderTrim.isEmpty()) {
            throw ApiException.badRequest("投资人不能为空");
        }
        if (!CODE_RE.matcher(codeTrim).matches()) {
            throw ApiException.badRequest("股票代码必须为6位数字");
        }
        if (dateTrim.isEmpty() || !DATE_RE.matcher(dateTrim).matches()) {
            throw ApiException.badRequest("推荐日期格式不正确");
        }

        long now = System.currentTimeMillis();
        String eventId = "manual_" + now;
        String trackingId = eventId + "_" + codeTrim;
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", trackingId);
        row.put("eventId", eventId);
        row.put("chatName", "");
        row.put("sender", senderTrim);
        row.put("stockCode", codeTrim);
        row.put("stockName", nameTrim);
        row.put("pickDate", dateTrim);
        row.put("pickMessage", str(payload.get("pickMessage")).trim());
        row.put("createdAt", now);
        row.put("updatedAt", now);
        trackingMapper.insertIgnore(row);

        refreshInBackground(trackingId);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("id", trackingId);
        out.put("eventId", eventId);
        return out;
    }

    // ==================== DELETE /api/wechat/tracking/:id ====================

    @DeleteMapping("/tracking/{id}")
    public Map<String, Object> deleteTracking(@PathVariable("id") String id) {
        if (id == null || id.isEmpty()) {
            throw ApiException.badRequest("追踪记录ID不能为空");
        }
        List<Map<String, Object>> rows = trackingMapper.listIdsById(id);
        Map<String, Object> out = new LinkedHashMap<>();
        if (rows.isEmpty()) {
            out.put("ok", true);
            out.put("id", id);
            out.put("alreadyDeleted", true);
            return out;
        }
        trackingMapper.softDelete(id, System.currentTimeMillis());
        trackingMapper.deleteDailyByTrackingId(id);
        out.put("ok", true);
        out.put("id", id);
        return out;
    }

    // ==================== DELETE /api/wechat/tracking/delete-by-date-range ====================
    // Node 端该路由（server.js 11992）注册在 DELETE /api/wechat/tracking/:id（11968）之后，
    // 被后者按注册顺序遮蔽，实际不可达：请求会落入 :id 处理分支并返回
    // { ok:true, id:'delete-by-date-range', alreadyDeleted:true }。
    // 为与之逐字节一致，此处不再注册该路由，交由 /tracking/{id} 处理。

    // ==================== PUT /api/wechat/tracking/batch-update ====================

    @PutMapping("/tracking/batch-update")
    public Map<String, Object> batchUpdate(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> payload = body == null ? new LinkedHashMap<>() : body;
        Object idsRaw = payload.get("ids");
        if (!(idsRaw instanceof List<?> idList) || idList.isEmpty()) {
            throw ApiException.badRequest("请选择要更新的记录");
        }
        List<String> validIds = new ArrayList<>();
        for (Object item : idList) {
            String value = str(item).trim();
            if (!value.isEmpty()) {
                validIds.add(value);
            }
        }
        if (validIds.isEmpty()) {
            throw ApiException.badRequest("无效的ID列表");
        }

        Object pickDateRaw = payload.get("pickDate");
        boolean hasPickDate = pickDateRaw != null && !str(pickDateRaw).isEmpty();
        String pickDate = null;
        if (hasPickDate) {
            if (!DATE_RE.matcher(str(pickDateRaw)).matches()) {
                throw ApiException.badRequest("日期格式必须是 YYYY-MM-DD");
            }
            pickDate = str(pickDateRaw);
        }
        boolean hasDelisted = payload.containsKey("delisted");
        Integer delisted = hasDelisted ? (truthy(payload.get("delisted")) ? 1 : 0) : null;

        if (!hasPickDate && !hasDelisted) {
            throw ApiException.badRequest("没有可更新的字段");
        }

        int affected = trackingMapper.batchUpdate(validIds, pickDate, delisted);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("affected", affected);
        out.put("updatedPickDate", hasPickDate);
        return out;
    }

    // ==================== PUT /api/wechat/tracking/:id/lock ====================

    @PutMapping("/tracking/{id}/lock")
    public Map<String, Object> lock(@PathVariable("id") String id,
                                    @RequestBody(required = false) Map<String, Object> body) {
        if (id == null || id.isEmpty()) {
            throw ApiException.badRequest("追踪记录ID不能为空");
        }
        boolean locked = body != null && truthy(body.get("locked"));
        if (locked) {
            try {
                trackingService.refreshTrackingPrices(id);
            } catch (Exception ignored) {
                // 锁定前刷新失败，继续锁定
            }
        }
        trackingMapper.updateLocked(id, locked ? 1 : 0, locked ? 1 : 0, System.currentTimeMillis());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("id", id);
        out.put("locked", locked);
        return out;
    }

    // ==================== PUT /api/wechat/tracking/:id/entry-type ====================

    @PutMapping("/tracking/{id}/entry-type")
    public Map<String, Object> entryType(@PathVariable("id") String id,
                                         @RequestBody(required = false) Map<String, Object> body) {
        if (id == null || id.isEmpty()) {
            throw ApiException.badRequest("追踪记录ID不能为空");
        }
        Object entryTypeRaw = body == null ? null : body.get("entryType");
        int et = jsNumberEqualsOne(entryTypeRaw) ? 1 : 0;
        trackingMapper.updateEntryType(id, et, System.currentTimeMillis());
        try {
            trackingService.refreshTrackingPrices(id);
        } catch (Exception error) {
            throw new ApiException(500, message(error), null);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("id", id);
        out.put("entryType", et);
        return out;
    }

    // ==================== GET /api/wechat/tracking/:id/daily ====================

    @GetMapping("/tracking/{id}/daily")
    public Map<String, Object> daily(@PathVariable("id") String id) {
        try {
            return trackingService.getDaily(id);
        } catch (Exception error) {
            throw new ApiException(500, message(error), null);
        }
    }

    // ==================== POST /api/wechat/tracking/:id/refresh ====================

    @PostMapping("/tracking/{id}/refresh")
    public Map<String, Object> refresh(@PathVariable("id") String id) {
        try {
            return trackingService.refreshTrackingPrices(id);
        } catch (Exception error) {
            throw new ApiException(500, message(error), null);
        }
    }

    // ==================== POST /api/wechat/tracking/refresh-all ====================

    @PostMapping("/tracking/refresh-all")
    public Map<String, Object> refreshAll() {
        try {
            return trackingService.refreshAll();
        } catch (Exception error) {
            throw new ApiException(500, message(error), null);
        }
    }

    // ==================== GET /api/wechat/investor-analysis ====================

    @GetMapping("/investor-analysis")
    public Map<String, Object> investorAnalysis(@RequestParam(value = "days", required = false) String daysRaw,
                                                @RequestParam(value = "targetProfitPercent", required = false) String targetRaw) {
        Double parsedDays = jsNumber(daysRaw);
        Double parsedTarget = jsNumber(targetRaw);
        int days = clampDays(parsedDays == null || parsedDays == 0 ? 7 : parsedDays);
        double target = parsedTarget == null || parsedTarget == 0 ? 5.00 : parsedTarget;
        return trackingService.investorAnalysis(days, target);
    }

    // ==================== GET /api/wechat/investor/:sender/hold-days ====================

    @GetMapping("/investor/{sender}/hold-days")
    public Map<String, Object> holdDays(@PathVariable("sender") String sender,
                                        @RequestParam(value = "targetProfit", required = false) String targetRaw,
                                        @RequestParam(value = "days", required = false) String daysRaw) {
        String decoded = sender == null ? "" : sender;
        if (decoded.isEmpty()) {
            throw ApiException.badRequest("投资人不能为空");
        }
        Double parsedTarget = jsNumber(targetRaw);
        double target = parsedTarget == null ? 0 : parsedTarget;
        Double parsedDays = jsNumber(daysRaw);
        int days = clampDays(parsedDays == null || parsedDays == 0 ? 7 : parsedDays);
        return trackingService.holdDays(decoded, target, days);
    }

    // ==================== DELETE /api/wechat/investor/:sender ====================

    @DeleteMapping("/investor/{sender}")
    public Map<String, Object> deleteInvestor(@PathVariable("sender") String sender) {
        String decoded = sender == null ? "" : sender;
        if (decoded.isEmpty()) {
            throw ApiException.badRequest("投资人不能为空");
        }
        List<Map<String, Object>> trackingRows = trackingMapper.listIdsBySender(decoded);
        List<String> trackingIds = new ArrayList<>();
        for (Map<String, Object> row : trackingRows) {
            trackingIds.add(WechatExtractService.str(row.get("id")));
        }
        if (!trackingIds.isEmpty()) {
            trackingMapper.deleteDailyByTrackingIds(trackingIds);
        }
        int deletedTracking = trackingMapper.deleteBySender(decoded);
        int deletedEvents = eventMapper.deleteBySender(decoded);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("sender", decoded);
        out.put("deletedTracking", deletedTracking);
        out.put("deletedEvents", deletedEvents);
        out.put("deletedDaily", trackingIds.size());
        return out;
    }

    // ==================== 内部工具 ====================

    private void refreshInBackground(String trackingId) {
        UserContext.CurrentUser user = UserContext.current();
        Thread thread = new Thread(() -> {
            UserContext.set(user);
            try {
                trackingService.refreshTrackingPrices(trackingId);
            } catch (Exception ignored) {
                // 手动添加的股价刷新失败不影响结果
            } finally {
                UserContext.clear();
            }
        }, "wechat-manual-refresh");
        thread.setDaemon(true);
        thread.start();
    }

    private static int clampDays(double days) {
        return (int) Math.max(1, Math.min(60, days));
    }

    private static String message(Exception error) {
        return error.getMessage() == null ? String.valueOf(error) : error.getMessage();
    }

    public static String str(Object value) {
        return WechatExtractService.str(value);
    }

    private static boolean truthy(Object value) {
        if (value == null) {
            return false;
        }
        if (value instanceof Boolean) {
            return (Boolean) value;
        }
        if (value instanceof Number) {
            return ((Number) value).doubleValue() != 0;
        }
        String text = String.valueOf(value);
        return !text.isEmpty() && !"0".equals(text) && !"false".equals(text);
    }

    private static boolean jsNumberEqualsOne(Object value) {
        Double number = jsNumberFromObject(value);
        return number != null && number == 1.0;
    }

    /** 等价 JS Number(x)：缺失或无法解析返回 null。 */
    private static Double jsNumberFromObject(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number) {
            return ((Number) value).doubleValue();
        }
        String text = String.valueOf(value).trim();
        if (text.isEmpty()) {
            return 0.0;
        }
        try {
            return Double.parseDouble(text);
        } catch (NumberFormatException error) {
            return null;
        }
    }

    private static Double jsNumber(String text) {
        if (text == null) {
            return null;
        }
        String value = text.trim();
        if (value.isEmpty()) {
            return 0.0;
        }
        try {
            return Double.parseDouble(value);
        } catch (NumberFormatException error) {
            return null;
        }
    }
}
