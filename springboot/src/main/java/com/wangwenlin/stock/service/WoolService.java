package com.wangwenlin.stock.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.common.Ids;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.common.RelationGuard;
import com.wangwenlin.stock.mapper.WoolMapper;
import com.wangwenlin.stock.model.WoolItemRow;
import com.wangwenlin.stock.model.WoolNoteRow;
import com.wangwenlin.stock.tenant.UserContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * 薅羊毛 / 消费 API —— 与 Node 端 server.js 的 /api/wool/* 逐行对齐（14 个路由）。
 * 记录写入时同步联动存款余额（applyWoolDepositDelta），逻辑与 Node 端 helper 一一对应。
 */
@Service
public class WoolService {

    private static final Pattern DATE_PATTERN = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");

    /** AI 整理优惠券笔记的系统提示词，与 Node 端逐字一致。 */
    private static final String ORGANIZE_SYSTEM_PROMPT = String.join("\n",
            "## 硬性强制要求（必须全部遵守，缺一不可）",
            "1. 完整保留原文里每一条链接，mp://、http、https全部一字不差，严禁遗漏、删减、篡改任意链接；",
            "2. 先剔除重复重复的整段酒店复制文案，只保留一份完整酒店资源，去除冗余重复开场白；",
            "3. 统一划分4大板块，板块分割线统一用-------------------：",
            "【🏨酒店专区】、【🍜外卖专区】、【🚕打车专区】、【🎞电影票专区】",
            "4. 每个板块内按平台归类：酒店顺序美团→同程→飞猪；外卖顺序美团→饿了么→淘宝外卖；打车滴滴/花小猪/T3依次排列；",
            "5. 同平台内区分酒店券、民宿券分开罗列，每条格式统一：emoji 【优惠名称】👉链接；多链接用数字1/2/3编号分行；",
            "6. 原文附带的提示语（酒店更新、全国5折、每日可领、全部领取比价、领不了备用券说明）全部整合到对应板块末尾或全文最后，不零散穿插在链接中间；",
            "7. 删除重复堆砌的相同引导句，只保留一次通用提醒，排版分行留白均匀，无杂乱挤堆文字；",
            "8. 原文末尾备用链接与领取失败说明完整保留，放在全文最底部，不丢失；",
            "9. 禁止合并、省略任何一条优惠入口，逐条单独分行展示，清晰不混淆。",
            "10. 优惠券链接必须完整保留，不能被修改或删除；",
            "11.删除与链接不相关文字，例如：“都领一下 哪个便宜用哪个”不是针对具体链接进行说明的，“⭐全部领一遍，哪个大用哪个”“备用链接与领取失败说明：",
            "如领取不了上面两个券",
            "可以领取下面三个优惠卷”，只需保留每个链接和对每个链接的说明");

    private static final String RECOGNIZE_SYSTEM_PROMPT =
            "你是严谨的中文消费票据识别助手。识别支付截图、订单、发票、小票、转账或返现凭证，只输出一个合法JSON对象，"
                    + "不要Markdown、解释或代码块。无法确认的文本字段返回空字符串，金额无法确认返回0。";

    private final WoolMapper woolMapper;
    private final RelationGuard relationGuard;
    private final ObjectMapper objectMapper;
    private final UploadService uploadService;
    private final AiCallService aiCallService;

    public WoolService(WoolMapper woolMapper,
                       RelationGuard relationGuard,
                       ObjectMapper objectMapper,
                       UploadService uploadService,
                       AiCallService aiCallService) {
        this.woolMapper = woolMapper;
        this.relationGuard = relationGuard;
        this.objectMapper = objectMapper;
        this.uploadService = uploadService;
        this.aiCallService = aiCallService;
    }

    // ==================== GET /api/wool ====================

    public List<Map<String, Object>> list() {
        List<Map<String, Object>> result = new ArrayList<>();
        for (WoolItemRow row : woolMapper.listItems()) {
            List<String> images = parseImages(row.getImages());
            if (JsValues.truthy(row.getImage()) && images.isEmpty()) {
                images = new ArrayList<>(List.of(row.getImage()));
            }
            LinkedHashMap<String, Object> item = new LinkedHashMap<>();
            item.put("id", row.getId());
            item.put("name", row.getName());
            item.put("amount", JsValues.parseOrZero(row.getAmount()));
            item.put("woolDate", row.getWoolDate());
            item.put("icon", row.getIcon());
            item.put("image", row.getImage());
            item.put("images", images);
            item.put("note", row.getNote());
            item.put("recordType", JsValues.orDefault(row.getRecordType(), "reward"));
            item.put("category", JsValues.orEmpty(row.getCategory()));
            item.put("merchant", JsValues.orEmpty(row.getMerchant()));
            item.put("paymentMethod", JsValues.orEmpty(row.getPaymentMethod()));
            item.put("depositItemId", JsValues.orEmpty(row.getDepositItemId()));
            item.put("depositTransactionId", JsValues.orEmpty(row.getDepositTransactionId()));
            item.put("createdAt", row.getCreatedAt() == null || row.getCreatedAt() == 0L ? "" : row.getCreatedAt());
            result.add(item);
        }
        return result;
    }

    // ==================== POST /api/wool ====================

    @Transactional
    public Map<String, Object> create(Map<String, Object> body) {
        Payload payload = sanitize(body == null ? Map.of() : body);
        if (payload.name().isEmpty() || payload.woolDate().isEmpty() || payload.amount() <= 0) {
            throw new ApiException(400, "名称、日期和金额不能为空");
        }
        try {
            String id = UUID.randomUUID().toString();
            long now = System.currentTimeMillis();
            String notePrefix = "spend".equals(payload.recordType()) ? "消费：" : "羊毛到账：";
            Map<String, Object> balance = applyWoolDepositDelta(payload.depositItemId(),
                    woolBalanceDelta(payload.recordType(), payload.amount()), notePrefix + payload.name(), now, id);
            String paymentMethod = payload.paymentMethod();
            if (JsValues.truthy(balance.get("depositName"))) {
                paymentMethod = JsValues.toJsString(balance.get("depositName"));
            }
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("id", id);
            data.put("name", payload.name());
            data.put("amount", payload.amount());
            data.put("woolDate", payload.woolDate());
            data.put("icon", payload.icon());
            data.put("image", payload.images().isEmpty() ? "" : payload.images().get(0));
            data.put("images", objectMapper.writeValueAsString(payload.images()));
            data.put("note", payload.note());
            data.put("recordType", payload.recordType());
            data.put("category", payload.category());
            data.put("merchant", payload.merchant());
            data.put("paymentMethod", paymentMethod);
            data.put("depositItemId", payload.depositItemId().isEmpty() ? null : payload.depositItemId());
            data.put("depositTransactionId", JsValues.truthy(balance.get("transactionId"))
                    ? balance.get("transactionId") : null);
            data.put("createdAt", now);
            relationGuard.validate("wool_items", Map.of(
                    "deposit_item_id", payload.depositItemId(),
                    "deposit_transaction_id", JsValues.orEmpty(balance.get("transactionId"))), 500);
            woolMapper.insertItem(data);

            LinkedHashMap<String, Object> result = new LinkedHashMap<>();
            result.put("id", id);
            result.put("name", payload.name());
            result.put("amount", payload.amount());
            result.put("woolDate", payload.woolDate());
            result.put("icon", payload.icon());
            result.put("images", payload.images());
            result.put("note", payload.note());
            result.put("recordType", payload.recordType());
            result.put("category", payload.category());
            result.put("merchant", payload.merchant());
            result.put("paymentMethod", paymentMethod);
            result.put("depositItemId", payload.depositItemId());
            result.put("depositTransactionId", JsValues.orEmpty(balance.get("transactionId")));
            result.put("createdAt", now);
            return result;
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw new ApiException(500, "新增失败: " + message(error));
        }
    }

    // ==================== PUT /api/wool/:id ====================

    @Transactional
    public Map<String, Object> update(String id, Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        WoolItemRow old = woolMapper.lockItem(id);
        if (old == null) {
            throw new ApiException(404, "记录不存在");
        }
        List<String> oldImages = parseImages(old.getImages());
        if (oldImages.isEmpty() && JsValues.truthy(old.getImage())) {
            oldImages = new ArrayList<>(List.of(old.getImage()));
        }
        Map<String, Object> merged = new LinkedHashMap<>();
        merged.put("name", old.getName());
        merged.put("amount", old.getAmount());
        merged.put("woolDate", old.getWoolDate());
        merged.put("icon", old.getIcon());
        merged.put("images", oldImages);
        merged.put("note", old.getNote());
        merged.put("recordType", old.getRecordType());
        merged.put("category", old.getCategory());
        merged.put("merchant", old.getMerchant());
        merged.put("paymentMethod", old.getPaymentMethod());
        merged.put("depositItemId", old.getDepositItemId());
        merged.putAll(b);
        Payload payload = sanitize(merged);
        if (payload.name().isEmpty() || payload.woolDate().isEmpty() || payload.amount() <= 0) {
            throw new ApiException(400, "名称、日期和金额不能为空");
        }
        try {
            String oldDepositId = JsValues.orEmpty(old.getDepositItemId());
            double newDelta = woolBalanceDelta(payload.recordType(), payload.amount());
            long now = System.currentTimeMillis();
            String latestTransactionId = "";
            String resolvedPaymentMethod = payload.paymentMethod();
            String notePrefix = "spend".equals(payload.recordType()) ? "消费：" : "羊毛到账：";
            if (!oldDepositId.isEmpty()) {
                double totalImpact = JsValues.parseOrZero(woolMapper.sumWoolTransactions(id));
                woolMapper.deleteWoolTransactions(id);
                Map<String, Object> account = woolMapper.lockDepositItem(oldDepositId);
                if (account != null) {
                    double reverted = JsValues.parseOrZero(account.get("amount")) - totalImpact;
                    woolMapper.updateDepositAmount(oldDepositId, reverted);
                }
            }
            if (!payload.depositItemId().isEmpty()) {
                Map<String, Object> applied = applyWoolDepositDelta(payload.depositItemId(), newDelta,
                        notePrefix + payload.name(), now, id);
                latestTransactionId = JsValues.orEmpty(applied.get("transactionId"));
                if (JsValues.truthy(applied.get("depositName"))) {
                    resolvedPaymentMethod = JsValues.toJsString(applied.get("depositName"));
                }
            }
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("id", id);
            data.put("name", payload.name());
            data.put("amount", payload.amount());
            data.put("woolDate", payload.woolDate());
            data.put("icon", payload.icon());
            data.put("image", payload.images().isEmpty() ? "" : payload.images().get(0));
            data.put("images", objectMapper.writeValueAsString(payload.images()));
            data.put("note", payload.note());
            data.put("recordType", payload.recordType());
            data.put("category", payload.category());
            data.put("merchant", payload.merchant());
            data.put("paymentMethod", resolvedPaymentMethod);
            data.put("depositItemId", payload.depositItemId().isEmpty() ? null : payload.depositItemId());
            data.put("depositTransactionId", latestTransactionId.isEmpty() ? null : latestTransactionId);
            data.put("createdAt", now);
            relationGuard.validate("wool_items", Map.of(
                    "deposit_item_id", payload.depositItemId(),
                    "deposit_transaction_id", latestTransactionId), 500);
            woolMapper.updateItem(data);

            LinkedHashMap<String, Object> result = new LinkedHashMap<>();
            result.put("ok", true);
            result.put("name", payload.name());
            result.put("amount", payload.amount());
            result.put("woolDate", payload.woolDate());
            result.put("icon", payload.icon());
            result.put("images", payload.images());
            result.put("note", payload.note());
            result.put("recordType", payload.recordType());
            result.put("category", payload.category());
            result.put("merchant", payload.merchant());
            result.put("paymentMethod", resolvedPaymentMethod);
            result.put("depositItemId", payload.depositItemId());
            result.put("depositTransactionId", latestTransactionId);
            result.put("createdAt", now);
            return result;
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw new ApiException(500, "更新失败: " + message(error));
        }
    }

    // ==================== DELETE /api/wool/:id ====================

    @Transactional
    public Map<String, Object> delete(String id) {
        WoolItemRow item = woolMapper.lockItem(id);
        if (item == null) {
            throw new ApiException(404, "记录不存在");
        }
        try {
            if (JsValues.truthy(item.getDepositItemId())) {
                woolMapper.deleteWoolTransactions(id);
                double delta = -woolBalanceDelta(JsValues.orDefault(item.getRecordType(), "reward"),
                        JsValues.parseOrZero(item.getAmount()));
                if (Math.abs(delta) >= 0.005) {
                    Map<String, Object> account = woolMapper.lockDepositItem(item.getDepositItemId());
                    if (account != null) {
                        double currentBalance = JsValues.parseOrZero(account.get("amount"));
                        woolMapper.updateDepositAmount(item.getDepositItemId(), currentBalance + delta);
                    }
                }
            }
            woolMapper.deleteItem(id);
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("ok", true);
            return result;
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw new ApiException(500, "删除失败: " + message(error));
        }
    }

    // ==================== GET /api/wool/notes ====================

    public List<Map<String, Object>> listNotes(String type) {
        List<WoolNoteRow> rows = woolMapper.listNotes(JsValues.truthy(type) ? type : null);
        List<Map<String, Object>> result = new ArrayList<>();
        for (WoolNoteRow row : rows) {
            LinkedHashMap<String, Object> item = new LinkedHashMap<>();
            item.put("id", row.getId());
            item.put("noteType", row.getNoteType());
            item.put("title", row.getTitle());
            item.put("content", row.getContent());
            item.put("createdAt", row.getCreatedAt());
            item.put("updatedAt", row.getUpdatedAt());
            result.add(item);
        }
        return result;
    }

    // ==================== POST /api/wool/notes ====================

    public Map<String, Object> createNote(Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        Object noteType = b.get("noteType");
        if (!JsValues.truthy(noteType)) {
            throw new ApiException(400, "缺少noteType");
        }
        Object title = JsValues.truthy(b.get("title")) ? b.get("title") : "";
        Object content = JsValues.truthy(b.get("content")) ? b.get("content") : "";
        String id = UUID.randomUUID().toString();
        long now = System.currentTimeMillis();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", id);
        data.put("noteType", noteType);
        data.put("title", title);
        data.put("content", content);
        data.put("createdAt", now);
        data.put("updatedAt", now);
        try {
            woolMapper.insertNote(data);
        } catch (Exception error) {
            throw new ApiException(500, "新增失败");
        }
        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        result.put("id", id);
        result.put("noteType", noteType);
        result.put("title", title);
        result.put("content", content);
        result.put("createdAt", now);
        result.put("updatedAt", now);
        return result;
    }

    // ==================== PUT /api/wool/notes/:id ====================

    public Map<String, Object> updateNote(String id, Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        long now = System.currentTimeMillis();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", id);
        if (b.containsKey("title")) {
            data.put("title", b.get("title"));
        }
        if (b.containsKey("content")) {
            data.put("content", b.get("content"));
        }
        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        if (data.size() == 1) {
            return result;
        }
        data.put("updatedAt", now);
        try {
            woolMapper.updateNote(data);
        } catch (Exception error) {
            throw new ApiException(500, "更新失败");
        }
        return result;
    }

    // ==================== DELETE /api/wool/notes/:id ====================

    public Map<String, Object> deleteNote(String id) {
        try {
            woolMapper.deleteNote(id);
        } catch (Exception error) {
            throw new ApiException(500, "删除失败");
        }
        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        return result;
    }

    // ==================== POST /api/wool/notes/organize ====================

    public Map<String, Object> organize(Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        String content = JsValues.truthy(b.get("content")) ? JsValues.toJsString(b.get("content")) : "";
        if (content.trim().isEmpty()) {
            throw new ApiException(400, "内容为空");
        }
        String model = JsValues.orDefault(b.get("model"), "glm-4-flash-250414");
        String userPrompt = "以下是需要整理的优惠券原文，请严格按照系统要求整理：\n\n" + content.trim();
        String organized;
        try {
            organized = aiCallService.callAI(ORGANIZE_SYSTEM_PROMPT, userPrompt, null, model, 60000, 4000);
        } catch (Exception error) {
            throw new ApiException(500, "整理失败: " + message(error));
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("organized", organized);
        return result;
    }

    // ==================== POST /api/wool/upload-image ====================

    public Map<String, Object> uploadImage(MultipartFile file) {
        if (file == null) {
            throw new ApiException(400, "未上传文件");
        }
        String contentType = file.getContentType() == null ? "" : file.getContentType();
        if (!contentType.startsWith("image/")) {
            throw new ApiException(400, "仅支持图片文件");
        }
        if (file.getSize() > 10L * 1024 * 1024) {
            throw new ApiException(400, "File too large");
        }
        long userId = UserContext.requireUserId();
        Path dir = uploadService.ensureTenantDir(userId, "wool");
        String original = file.getOriginalFilename() == null ? "" : file.getOriginalFilename();
        LocalDate today = LocalDate.now();
        String dateStr = "" + today.getYear() + pad2(today.getMonthValue()) + pad2(today.getDayOfMonth());
        String filename = "薅羊毛" + dateStr + base36() + extname(original);
        try {
            file.transferTo(dir.resolve(filename).toAbsolutePath());
        } catch (Exception error) {
            throw new ApiException(400, "上传失败");
        }
        return Map.of("imagePath", "uploads/wool/" + filename);
    }

    // ==================== POST /api/wool/recognize ====================

    public Map<String, Object> recognize(Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        String imagePath = JsValues.toJsString(JsValues.truthy(b.get("imagePath")) ? b.get("imagePath") : "");
        long userId = UserContext.requireUserId();
        Path fullPath;
        try {
            fullPath = uploadService.resolveTenantPath(userId, imagePath);
        } catch (IllegalArgumentException error) {
            throw new ApiException(500, "AI识别失败: " + error.getMessage());
        }
        Path woolDir = uploadService.ensureTenantDir(userId, "wool");
        if (fullPath.getParent() == null || !fullPath.getParent().equals(woolDir)) {
            throw new ApiException(400, "无效的凭证图片路径");
        }
        if (!Files.exists(fullPath)) {
            throw new ApiException(404, "凭证图片不存在");
        }
        LocalDate now = LocalDate.now();
        String currentDate = "" + now.getYear() + "-" + pad2(now.getMonthValue()) + "-" + pad2(now.getDayOfMonth());
        String userPrompt = "今天是" + currentDate + "。请从图片提取以下字段：recordType只能是spend或reward，普通付款/购买为spend，"
                + "返现/红包/退款到账为reward；name为简洁的商品或消费名称；amount为最终实付或实际到账金额数字，不要原价；"
                + "woolDate为YYYY-MM-DD；category为最贴切的中文分类且允许自定义；merchant为商户、平台或资金去向；"
                + "note补充订单号、商品明细、优惠和识别不确定项；confidence为0到1。严格返回："
                + "{\"recordType\":\"spend\",\"name\":\"\",\"amount\":0,\"woolDate\":\"\",\"category\":\"\",\"merchant\":\"\",\"note\":\"\",\"confidence\":0}";
        String model = envOr("GLM_VISION_MODEL", "glm-4.6v");
        String raw;
        try {
            raw = aiCallService.callAI(RECOGNIZE_SYSTEM_PROMPT, userPrompt, imagePath, model, 65000, 1200);
        } catch (Exception error) {
            throw new ApiException(500, "AI识别失败: " + message(error));
        }
        String rawText = JsValues.toJsString(raw);
        if (rawText.contains("未配置") && rawText.contains("API Key")) {
            throw new ApiException(400, rawText);
        }
        Map<String, Object> parsed = parseAiJson(raw);
        Object woolDate = parsed.get("woolDate");
        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        result.put("recordType", "reward".equals(parsed.get("recordType")) ? "reward" : "spend");
        result.put("name", slice(text(parsed.get("name")).trim(), 200));
        result.put("amount", Math.max(0d, JsValues.parseOrZero(parsed.get("amount"))));
        result.put("woolDate", DATE_PATTERN.matcher(text(woolDate)).matches()
                ? JsValues.toJsString(woolDate) : "");
        result.put("category", slice(text(parsed.get("category")).trim(), 64));
        result.put("merchant", slice(text(parsed.get("merchant")).trim(), 120));
        result.put("note", slice(text(parsed.get("note")).trim(), 500));
        result.put("confidence", Math.max(0d, Math.min(1d, JsValues.parseOrZero(parsed.get("confidence")))));
        result.put("model", model);
        return result;
    }

    // ==================== GET /api/wool/calendar ====================

    public List<Map<String, Object>> calendar(String month) {
        List<Map<String, Object>> result = new ArrayList<>();
        if (!JsValues.truthy(month)) {
            return result;
        }
        List<Map<String, Object>> rows = woolMapper.calendarItems(month + "%");
        List<Map<String, Object>> quickRows = woolMapper.calendarQuickAmounts(month + "%");
        Map<String, Double> quickMap = new LinkedHashMap<>();
        for (Map<String, Object> row : quickRows) {
            quickMap.put(String.valueOf(row.get("woolDate")), JsValues.parseOrZero(row.get("quickAmount")));
        }
        for (Map<String, Object> row : rows) {
            String woolDate = String.valueOf(row.get("woolDate"));
            double rewardTotal = JsValues.parseOrZero(row.get("rewardTotal"));
            double spendTotal = JsValues.parseOrZero(row.get("spendTotal"));
            double quickAmount = quickMap.getOrDefault(woolDate, 0d);
            LinkedHashMap<String, Object> item = new LinkedHashMap<>();
            item.put("woolDate", woolDate);
            item.put("total", rewardTotal + quickAmount - spendTotal);
            item.put("rewardTotal", rewardTotal + quickAmount);
            item.put("spendTotal", spendTotal);
            item.put("itemsTotal", rewardTotal - spendTotal);
            item.put("quickAmount", quickAmount);
            item.put("count", row.get("itemCount"));
            result.add(item);
        }
        for (Map<String, Object> row : quickRows) {
            String woolDate = String.valueOf(row.get("woolDate"));
            boolean exists = rows.stream().anyMatch(x -> woolDate.equals(String.valueOf(x.get("woolDate"))));
            if (exists) {
                continue;
            }
            double quickAmount = JsValues.parseOrZero(row.get("quickAmount"));
            LinkedHashMap<String, Object> item = new LinkedHashMap<>();
            item.put("woolDate", woolDate);
            item.put("total", quickAmount);
            item.put("rewardTotal", quickAmount);
            item.put("spendTotal", 0);
            item.put("itemsTotal", 0);
            item.put("quickAmount", quickAmount);
            item.put("count", 0);
            result.add(item);
        }
        return result;
    }

    // ==================== GET /api/wool/daily/:date ====================

    public Map<String, Object> getDaily(String date) {
        Map<String, Object> row = woolMapper.findDaily(date);
        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        if (row == null) {
            result.put("woolDate", date);
            result.put("quickAmount", 0d);
            return result;
        }
        result.put("woolDate", row.get("wool_date"));
        result.put("quickAmount", JsValues.parseOrZero(row.get("quick_amount")));
        return result;
    }

    // ==================== PUT /api/wool/daily/:date ====================

    public Map<String, Object> putDaily(String date, Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        Double parsed = JsValues.parseFloat(b.get("quickAmount"));
        double amount = parsed == null || parsed == 0d ? 0d : parsed;
        long now = System.currentTimeMillis();
        try {
            Map<String, Object> existing = woolMapper.findDaily(date);
            if (existing != null) {
                Map<String, Object> data = new LinkedHashMap<>();
                data.put("woolDate", date);
                data.put("quickAmount", amount);
                data.put("updatedAt", now);
                woolMapper.updateDaily(data);
            } else {
                Map<String, Object> data = new LinkedHashMap<>();
                data.put("id", "wda_" + date.replace("-", ""));
                data.put("woolDate", date);
                data.put("quickAmount", amount);
                data.put("createdAt", now);
                data.put("updatedAt", now);
                woolMapper.insertDaily(data);
            }
        } catch (Exception error) {
            throw new ApiException(500, "保存失败");
        }
        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        result.put("woolDate", date);
        result.put("quickAmount", amount);
        return result;
    }

    // ==================== 内部逻辑 ====================

    private record Payload(String name, double amount, String woolDate, String icon, List<String> images,
                           String note, String recordType, String category, String merchant,
                           String paymentMethod, String depositItemId) {
    }

    /** 等价 sanitizeWoolPayload：所有字段按 Node 的 String(x || '').trim().slice() 规则归一。 */
    private Payload sanitize(Map<String, Object> input) {
        List<String> images = new ArrayList<>();
        if (input.get("images") instanceof List<?> list) {
            for (Object item : list) {
                if (item instanceof String text) {
                    images.add(text);
                }
                if (images.size() == 9) {
                    break;
                }
            }
        }
        return new Payload(
                slice(text(input.get("name")).trim(), 200),
                Math.max(0d, JsValues.parseOrZero(input.get("amount"))),
                slice(text(input.get("woolDate")), 10),
                slice(text(input.get("icon")), 500),
                images,
                slice(text(input.get("note")), 500),
                "spend".equals(input.get("recordType")) ? "spend" : "reward",
                slice(text(input.get("category")).trim(), 64),
                slice(text(input.get("merchant")).trim(), 120),
                slice(text(input.get("paymentMethod")).trim(), 64),
                JsValues.truthy(input.get("depositItemId")) ? slice(JsValues.toJsString(input.get("depositItemId")), 64) : ""
        );
    }

    /** 等价 woolBalanceDelta：支出为负、其它为正，且金额先归零到非负。 */
    private static double woolBalanceDelta(String recordType, double amount) {
        double value = Math.max(0d, amount);
        return "spend".equals(recordType) ? -value : value;
    }

    /**
     * 等价 applyWoolDepositDelta：按影响额同步存款余额并写一条资金明细。
     * 关联的存款项不存在时抛 400（对应 Node 的 statusCode=400）。
     */
    private Map<String, Object> applyWoolDepositDelta(String depositItemId, double delta, String note,
                                                      long now, String woolItemId) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("transactionId", "");
        result.put("depositName", "");
        result.put("balanceAfter", null);
        if (depositItemId.isEmpty() || Math.abs(delta) < 0.005) {
            return result;
        }
        Map<String, Object> item = woolMapper.lockDepositItem(depositItemId);
        if (item == null) {
            throw new ApiException(400, "选择的存款小项不存在或已被删除");
        }
        double currentBalance = JsValues.parseOrZero(item.get("amount"));
        double nextBalance = currentBalance + delta;
        String transactionId = Ids.genId();
        woolMapper.updateDepositAmount(depositItemId, nextBalance);
        relationGuard.validate("deposit_transactions", Map.of("deposit_item_id", depositItemId), 500);
        Map<String, Object> transaction = new LinkedHashMap<>();
        transaction.put("id", transactionId);
        transaction.put("depositItemId", depositItemId);
        transaction.put("woolItemId", woolItemId);
        transaction.put("type", delta >= 0 ? "add" : "deduct");
        transaction.put("amount", delta);
        transaction.put("balanceBefore", currentBalance);
        transaction.put("balanceAfter", nextBalance);
        transaction.put("note", slice(note == null ? "" : note, 200));
        transaction.put("createdAt", now);
        woolMapper.insertWoolTransaction(transaction);
        result.put("transactionId", transactionId);
        result.put("depositName", JsValues.orEmpty(item.get("name")));
        result.put("balanceAfter", nextBalance);
        return result;
    }

    /** 等价 parseAIJson：剥掉 Markdown 代码围栏后截取首个 { 到末个 }。 */
    private Map<String, Object> parseAiJson(String content) {
        String text = JsValues.toJsString(content).replaceAll("(?i)```(json)?", "").trim();
        int start = text.indexOf('{');
        int end = text.lastIndexOf('}');
        if (start < 0 || end <= start) {
            throw new ApiException(500, "AI未返回可解析的结构化结果");
        }
        try {
            Object parsed = objectMapper.readValue(text.substring(start, end + 1), Object.class);
            if (parsed instanceof Map<?, ?> map) {
                Map<String, Object> result = new LinkedHashMap<>();
                for (Map.Entry<?, ?> entry : map.entrySet()) {
                    result.put(String.valueOf(entry.getKey()), entry.getValue());
                }
                return result;
            }
        } catch (Exception error) {
            throw new ApiException(500, error.getMessage() == null ? "JSON 解析失败" : error.getMessage());
        }
        throw new ApiException(500, "AI未返回可解析的结构化结果");
    }

    private List<String> parseImages(String raw) {
        List<String> result = new ArrayList<>();
        if (raw == null || raw.isEmpty()) {
            return result;
        }
        try {
            Object parsed = objectMapper.readValue(raw, Object.class);
            if (parsed instanceof List<?> list) {
                for (Object item : list) {
                    if (item instanceof String text) {
                        result.add(text);
                    }
                }
            }
        } catch (Exception ignored) {
            return new ArrayList<>();
        }
        return result;
    }

    private static String envOr(String key, String fallback) {
        String value = System.getenv(key);
        return value == null || value.isEmpty() ? fallback : value;
    }

    /** 等价 {@code String(value || '')}。 */
    private static String text(Object value) {
        return JsValues.toJsString(JsValues.truthy(value) ? value : "");
    }

    private static String slice(String value, int maxLength) {
        return value.length() > maxLength ? value.substring(0, maxLength) : value;
    }

    private static String pad2(int value) {
        return value < 10 ? "0" + value : String.valueOf(value);
    }

    private static String extname(String filename) {
        int slash = Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\'));
        int index = filename.lastIndexOf('.');
        return index <= slash + 1 ? "" : filename.substring(index);
    }

    /** 等价 {@code Math.random().toString(36).slice(2, 8)}，取 6 位随机串。 */
    private static String base36() {
        String value = Long.toString((long) (Math.random() * 2_176_782_336L), 36);
        return "000000".substring(Math.min(value.length(), 6)) + value;
    }

    private static String message(Exception error) {
        return error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
    }
}
