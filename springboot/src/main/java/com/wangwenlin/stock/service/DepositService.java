package com.wangwenlin.stock.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.common.Ids;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.common.RelationGuard;
import com.wangwenlin.stock.mapper.DepositMapper;
import com.wangwenlin.stock.mapper.InstallmentMapper;
import com.wangwenlin.stock.tenant.UserContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 存款 / 账户 API —— 与 Node 端 server.js 的 /api/deposits/* 逐行对齐（12 个路由）。
 * 分期相关逻辑（排期重建、待还金额回写、到期账单）委托给 InstallmentService / InstallmentMapper。
 */
@Service
public class DepositService {

    private static final Pattern ICON_PATTERN = Pattern.compile("\\.(png|jpg|jpeg|gif|webp|svg|ico)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern UNSAFE_NAME = Pattern.compile("[\\\\/:*?\"<>|]");

    private final DepositMapper depositMapper;
    private final InstallmentMapper installmentMapper;
    private final InstallmentService installmentService;
    private final UploadService uploadService;
    private final AiSettingsService settingsService;
    private final RelationGuard relationGuard;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(20))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    public DepositService(DepositMapper depositMapper,
                          InstallmentMapper installmentMapper,
                          InstallmentService installmentService,
                          UploadService uploadService,
                          AiSettingsService settingsService,
                          RelationGuard relationGuard,
                          ObjectMapper objectMapper) {
        this.depositMapper = depositMapper;
        this.installmentMapper = installmentMapper;
        this.installmentService = installmentService;
        this.uploadService = uploadService;
        this.settingsService = settingsService;
        this.relationGuard = relationGuard;
        this.objectMapper = objectMapper;
    }

    // ==================== GET /api/deposits ====================

    public List<Map<String, Object>> list() {
        autoPayBills();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : depositMapper.listItemsWithPlan()) {
            Object itemType = row.get("item_type");
            Object amount = "installment".equals(itemType)
                    ? -JsValues.parseOrZero(row.get("installment_remaining"))
                    : JsValues.parse(row.get("amount"));
            LinkedHashMap<String, Object> item = new LinkedHashMap<>();
            item.put("id", row.get("id"));
            item.put("groupName", row.get("group_name"));
            item.put("name", row.get("name"));
            item.put("amount", amount);
            item.put("rate", row.get("rate") == null ? null : JsValues.parse(row.get("rate")));
            item.put("note", JsValues.orEmpty(row.get("note")));
            item.put("sortOrder", row.get("sort_order"));
            item.put("createdAt", row.get("created_at"));
            item.put("icon", JsValues.orEmpty(row.get("icon")));
            item.put("bindType", JsValues.orEmpty(row.get("bind_type")));
            item.put("excludeTotal", JsValues.parseOrZero(row.get("exclude_total")) == 1d);
            item.put("itemType", JsValues.orEmpty(row.get("item_type")).isEmpty()
                    ? "normal" : row.get("item_type"));
            item.put("repaymentDay", row.get("repayment_day"));
            item.put("paymentAccountId", JsValues.orEmpty(row.get("payment_account_id")));
            item.put("repaymentMode", JsValues.orEmpty(row.get("repayment_mode")).isEmpty()
                    ? "auto" : row.get("repayment_mode"));
            item.put("totalPrincipal", row.get("total_principal") == null ? 0 : JsValues.parse(row.get("total_principal")));
            item.put("totalInterest", row.get("total_interest") == null ? 0 : JsValues.parse(row.get("total_interest")));
            item.put("installments", JsValues.truthy(row.get("installments")) ? row.get("installments") : 0);
            item.put("monthlyDay", JsValues.truthy(row.get("monthly_day")) ? row.get("monthly_day") : 1);
            item.put("startDate", JsValues.orEmpty(row.get("start_date")));
            item.put("planId", JsValues.orEmpty(row.get("plan_id")));
            out.add(item);
        }
        return out;
    }

    // ==================== POST /api/deposits ====================

    public Map<String, Object> create(Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        String id = Ids.genId();
        Object itemType = b.get("itemType");
        String finalItemType = "normal".equals(itemType) || "debt".equals(itemType) || "installment".equals(itemType)
                ? String.valueOf(itemType) : "normal";
        Object repaymentMode = b.get("repaymentMode");
        String finalRepaymentMode = "auto".equals(repaymentMode) || "manual".equals(repaymentMode)
                ? String.valueOf(repaymentMode) : "auto";
        Object paymentAccountId = JsValues.truthyOrNull(b.get("paymentAccountId"));
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", id);
        data.put("groupName", JsValues.truthy(b.get("groupName")) ? b.get("groupName") : "默认分组");
        data.put("name", JsValues.truthy(b.get("name")) ? b.get("name") : "");
        data.put("amount", JsValues.truthy(b.get("amount")) ? b.get("amount") : 0);
        data.put("rate", JsValues.truthyOrNull(b.get("rate")));
        data.put("note", JsValues.truthy(b.get("note")) ? b.get("note") : "");
        data.put("sortOrder", JsValues.truthy(b.get("sortOrder")) ? b.get("sortOrder") : 0);
        data.put("createdAt", System.currentTimeMillis());
        data.put("icon", JsValues.truthy(b.get("icon")) ? b.get("icon") : "");
        data.put("bindType", JsValues.truthy(b.get("bindType")) ? b.get("bindType") : "");
        data.put("excludeTotal", JsValues.truthy(b.get("excludeTotal")) ? 1 : 0);
        data.put("itemType", finalItemType);
        data.put("repaymentDay", JsValues.truthyOrNull(b.get("repaymentDay")));
        data.put("paymentAccountId", paymentAccountId);
        data.put("repaymentMode", finalRepaymentMode);
        // 对齐 Node：仅当 payment_account_id 非空时才做关联校验（NULL / '' 直接跳过）
        if (JsValues.truthy(paymentAccountId)) {
            relationGuard.validate("deposit_items", Map.of("payment_account_id", paymentAccountId), 500);
        }
        depositMapper.insertItem(data);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", id);
        return result;
    }

    // ==================== PUT /api/deposits/:id ====================

    public Map<String, Object> update(String id, Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        // 对齐 Node：仅当 paymentAccountId 出现在 body 且非空时才做关联校验
        Object rawAccountId = b.get("paymentAccountId");
        if (b.containsKey("paymentAccountId") && JsValues.truthy(rawAccountId)) {
            relationGuard.validate("deposit_items", Map.of("payment_account_id", rawAccountId), 500);
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", id);
        if (b.containsKey("groupName")) {
            data.put("groupName", b.get("groupName"));
        }
        if (b.containsKey("name")) {
            data.put("name", b.get("name"));
        }
        if (b.containsKey("amount")) {
            data.put("amount", b.get("amount"));
        }
        if (b.containsKey("rate")) {
            data.put("rate", b.get("rate"));
        }
        if (b.containsKey("note")) {
            data.put("note", b.get("note"));
        }
        if (b.containsKey("sortOrder")) {
            data.put("sortOrder", b.get("sortOrder"));
        }
        if (b.containsKey("icon")) {
            data.put("icon", b.get("icon"));
        }
        if (b.containsKey("bindType")) {
            data.put("bindType", b.get("bindType"));
        }
        if (b.containsKey("excludeTotal")) {
            data.put("excludeTotal", JsValues.truthy(b.get("excludeTotal")) ? 1 : 0);
        }
        if (b.containsKey("itemType")) {
            Object itemType = b.get("itemType");
            data.put("itemType", "normal".equals(itemType) || "debt".equals(itemType) || "installment".equals(itemType)
                    ? String.valueOf(itemType) : "normal");
        }
        if (b.containsKey("repaymentDay")) {
            data.put("repaymentDay", JsValues.truthyOrNull(b.get("repaymentDay")));
        }
        if (b.containsKey("paymentAccountId")) {
            data.put("paymentAccountId", JsValues.truthyOrNull(b.get("paymentAccountId")));
        }
        if (b.containsKey("repaymentMode")) {
            Object repaymentMode = b.get("repaymentMode");
            data.put("repaymentMode", "auto".equals(repaymentMode) || "manual".equals(repaymentMode)
                    ? String.valueOf(repaymentMode) : "auto");
        }
        if (data.size() == 1) {
            return Map.of("success", true);
        }
        depositMapper.updateFields(data);
        return Map.of("success", true);
    }

    // ==================== DELETE /api/deposits/:id ====================

    public Map<String, Object> delete(String id) {
        depositMapper.deleteItem(id);
        return Map.of("success", true);
    }

    // ==================== PUT /api/deposits/:id/move ====================

    public Map<String, Object> move(String id, Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        depositMapper.moveItem(id, b.get("groupName"), JsValues.truthy(b.get("sortOrder")) ? b.get("sortOrder") : 0);
        return Map.of("success", true);
    }

    // ==================== GET /api/deposits/icons ====================

    public List<Map<String, Object>> listIcons() {
        long userId = UserContext.requireUserId();
        Path dir = uploadService.ensureTenantDir(userId, "icons");
        List<Map<String, Object>> icons = new ArrayList<>();
        try (var stream = Files.newDirectoryStream(dir)) {
            for (Path path : stream) {
                String filename = path.getFileName().toString();
                if (ICON_PATTERN.matcher(filename).find()) {
                    LinkedHashMap<String, Object> icon = new LinkedHashMap<>();
                    icon.put("name", filename);
                    icon.put("path", "uploads/icons/" + filename);
                    icons.add(icon);
                }
            }
        } catch (Exception ignored) {
            // 对齐 Node：目录不存在时返回空数组
        }
        return icons;
    }

    // ==================== POST /api/deposits/upload-icon ====================

    public Map<String, Object> uploadIcon(MultipartFile file, String name) {
        if (file == null) {
            throw new ApiException(400, "未上传文件");
        }
        if (file.getSize() > 10L * 1024 * 1024) {
            throw new ApiException(400, "File too large");
        }
        long userId = UserContext.requireUserId();
        Path dir = uploadService.ensureTenantDir(userId, "icons");
        String original = file.getOriginalFilename() == null ? "" : file.getOriginalFilename();
        String ext = extname(original);
        String filename = System.currentTimeMillis() + "-" + base36() + ext;
        if (JsValues.truthy(name)) {
            filename = UNSAFE_NAME.matcher(name).replaceAll("_") + "-" + System.currentTimeMillis() + ext;
        }
        try {
            file.transferTo(dir.resolve(filename).toAbsolutePath());
        } catch (Exception error) {
            throw new ApiException(500, "保存文件失败");
        }
        return Map.of("iconPath", "uploads/icons/" + filename);
    }

    // ==================== POST /api/deposits/generate-icon ====================

    public Map<String, Object> generateIcon(Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        String prompt = JsValues.truthy(b.get("prompt")) ? JsValues.toJsString(b.get("prompt")) : "";
        prompt = prompt.trim();
        String finalPrompt = prompt;
        if (finalPrompt.isEmpty() && JsValues.truthy(b.get("title"))) {
            finalPrompt = "扁平可爱动画图标，" + JsValues.toJsString(b.get("title"))
                    + "，圆角造型，圆润软乎乎轮廓，低饱和度马卡龙配色，柔和渐变，细腻柔和阴影，极简干净背景，"
                    + "卡通Q版质感，2D矢量插画，高细节，干净线条，治愈童趣，柔和柔光，无多余杂物，UI图标，高清，"
                    + "禁止尖锐棱角，禁止深色暗沉色调，禁止写实照片质感，禁止复杂杂乱背景，禁止粗糙噪点，"
                    + "禁止立体厚重浮雕，禁止暗黑风格";
        }
        if (finalPrompt.isEmpty()) {
            throw new ApiException(400, "请提供提示词或存款项标题");
        }
        String apiKey = settingsService.getUserSecret("glm_api_key");
        if (apiKey == null || apiKey.isEmpty()) {
            throw new ApiException(400, "未配置智谱 API Key，请在 AI 设置中配置");
        }
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("model", "cogview-3-flash");
            payload.put("prompt", finalPrompt);
            payload.put("size", "1024x1024");
            payload.put("quality", "standard");
            payload.put("watermark_enabled", true);
            HttpRequest request = HttpRequest.newBuilder(URI.create("https://open.bigmodel.cn/api/paas/v4/images/generations"))
                    .timeout(Duration.ofSeconds(180))
                    .header("content-type", "application/json")
                    .header("Authorization", "Bearer " + apiKey)
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new ApiException(500, "AI Image API 请求失败 (" + response.statusCode() + "): " + response.body());
            }
            Object parsed = objectMapper.readValue(response.body(), Object.class);
            String imageUrl = null;
            if (parsed instanceof Map<?, ?> root) {
                Object dataNode = root.get("data");
                if (dataNode instanceof List<?> list && !list.isEmpty() && list.get(0) instanceof Map<?, ?> first) {
                    Object url = first.get("url");
                    imageUrl = url == null ? null : String.valueOf(url);
                }
            }
            if (imageUrl == null || imageUrl.isEmpty()) {
                throw new ApiException(500, "AI 未返回图像URL");
            }
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("iconUrl", imageUrl);
            result.put("prompt", finalPrompt);
            return result;
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw new ApiException(500, "生成失败: " + message(error));
        }
    }

    // ==================== POST /api/deposits/save-icon ====================

    public Map<String, Object> saveIcon(Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        String imageUrl = JsValues.truthy(b.get("imageUrl")) ? JsValues.toJsString(b.get("imageUrl")) : "";
        if (imageUrl.isEmpty()) {
            throw new ApiException(400, "缺少图片URL");
        }
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(imageUrl))
                    .timeout(Duration.ofSeconds(30))
                    .GET()
                    .build();
            HttpResponse<byte[]> response = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new ApiException(500, "下载图片失败 (" + response.statusCode() + ")");
            }
            long userId = UserContext.requireUserId();
            Path dir = uploadService.ensureTenantDir(userId, "icons");
            String title = JsValues.truthy(b.get("title")) ? JsValues.toJsString(b.get("title")) : "ai-icon";
            String safe = UNSAFE_NAME.matcher(title).replaceAll("_");
            safe = safe.length() > 30 ? safe.substring(0, 30) : safe;
            String filename = safe + "-" + System.currentTimeMillis() + ".png";
            Files.write(dir.resolve(filename), response.body());
            return Map.of("iconPath", "uploads/icons/" + filename);
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw new ApiException(500, "保存失败: " + message(error));
        }
    }

    // ==================== GET /api/deposits/:id/transactions ====================

    public List<Map<String, Object>> listTransactions(String id) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : depositMapper.listTransactions(id)) {
            LinkedHashMap<String, Object> tx = new LinkedHashMap<>();
            tx.put("id", row.get("id"));
            tx.put("deposit_item_id", row.get("deposit_item_id"));
            tx.put("wool_item_id", row.get("wool_item_id"));
            tx.put("type", row.get("type"));
            tx.put("amount", row.get("amount"));
            tx.put("balance_before", row.get("balance_before"));
            tx.put("balance_after", row.get("balance_after"));
            tx.put("note", row.get("note"));
            tx.put("created_at", row.get("created_at"));
            tx.put("user_id", row.get("user_id"));
            out.add(tx);
        }
        return out;
    }

    // ==================== POST /api/deposits/:id/transactions ====================

    @Transactional
    public Map<String, Object> insertTransactionById(String id, Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        Object mode = b.get("mode");
        long now = System.currentTimeMillis();
        Map<String, Object> items = depositMapper.findItem(id);
        if (items == null) {
            throw new ApiException(404, "存款项不存在");
        }
        double currentBalance = JsValues.parseOrZero(items.get("amount"));
        double numAmount = JsValues.parseOrZero(b.get("amount"));

        double newBalance;
        String type;
        double txAmount;
        if ("add".equals(mode)) {
            newBalance = currentBalance + numAmount;
            type = "add";
            txAmount = numAmount;
        } else if ("deduct".equals(mode)) {
            newBalance = currentBalance - numAmount;
            type = "deduct";
            txAmount = -numAmount;
        } else if ("set".equals(mode)) {
            double diff = numAmount - currentBalance;
            type = diff >= 0 ? "add" : "deduct";
            txAmount = diff;
            newBalance = numAmount;
        } else if ("init".equals(mode)) {
            newBalance = numAmount;
            type = "init";
            txAmount = numAmount;
        } else {
            throw new ApiException(400, "无效模式");
        }
        depositMapper.updateAmount(id, newBalance);
        String txId = Ids.genId();
        insertTransaction(id, type, txAmount, currentBalance, newBalance,
                JsValues.truthy(b.get("note")) ? JsValues.toJsString(b.get("note")) : "", now);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", txId);
        result.put("balanceBefore", currentBalance);
        result.put("balanceAfter", newBalance);
        result.put("type", type);
        result.put("amount", txAmount);
        return result;
    }

    // ==================== POST /api/deposits/:id/repay ====================

    @Transactional
    public Map<String, Object> repay(String id, Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        long now = System.currentTimeMillis();
        double repayAmount = JsValues.parseOrZero(b.get("amount"));
        String note = JsValues.truthy(b.get("note")) ? JsValues.toJsString(b.get("note")) : "";
        if (repayAmount <= 0) {
            throw new ApiException(400, "还款金额必须大于0");
        }
        Map<String, Object> debt = depositMapper.lockDebt(id);
        if (debt == null) {
            throw new ApiException(404, "欠款项不存在");
        }
        if (!"debt".equals(String.valueOf(debt.get("item_type")))) {
            throw new ApiException(400, "仅普通欠款支持手动还款");
        }
        double currentDebt = JsValues.parseOrZero(debt.get("amount"));
        if (currentDebt >= 0) {
            throw new ApiException(400, "无待还欠款");
        }
        double actualRepay = Math.min(repayAmount, Math.abs(currentDebt));
        double newDebtAmount = currentDebt + actualRepay;
        Object accountId = debt.get("payment_account_id");
        if (!JsValues.truthy(accountId)) {
            throw new ApiException(400, "未绑定还款账户");
        }
        Map<String, Object> account = depositMapper.lockAccount(String.valueOf(accountId));
        if (account == null) {
            throw new ApiException(404, "还款账户不存在");
        }
        double accountBefore = JsValues.parseOrZero(account.get("amount"));
        double newAccountBalance = accountBefore - actualRepay;
        depositMapper.updateAmount(String.valueOf(accountId), newAccountBalance);
        String debtName = JsValues.orEmpty(debt.get("name"));
        insertTransaction(String.valueOf(accountId), "deduct", -actualRepay, accountBefore, newAccountBalance,
                note.isEmpty() ? "还款-" + debtName : note, now);
        depositMapper.updateAmount(id, newDebtAmount);
        insertTransaction(id, "add", actualRepay, currentDebt, newDebtAmount,
                note.isEmpty() ? "手动还款" : note, now);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("repaidAmount", actualRepay);
        result.put("debtBefore", currentDebt);
        result.put("debtAfter", newDebtAmount);
        result.put("accountBefore", accountBefore);
        result.put("accountAfter", newAccountBalance);
        return result;
    }

    // ==================== 自动还款（对齐 autoPayBills）====================

    public void autoPayBills() {
        // 对齐 Node：today 用 UTC 日期串，todayDay 用本地日（new Date().getDate()）
        String today = LocalDate.now(ZoneOffset.UTC).toString();
        int todayDay = LocalDate.now().getDayOfMonth();
        long now = System.currentTimeMillis();

        // 1) 分期账单到期自动还款
        for (Map<String, Object> bill : installmentMapper.listDueBills(today)) {
            String billId = String.valueOf(bill.get("bill_id"));
            installmentMapper.markBillPaid(billId, now);
            double billTotal = JsValues.parseOrZero(bill.get("bill_total"));
            int period = (int) JsValues.parseOrZero(bill.get("period"));
            String itemName = JsValues.orEmpty(bill.get("item_name"));
            Object accountId = bill.get("payment_account_id");
            if (JsValues.truthy(accountId)) {
                Map<String, Object> account = depositMapper.findItem(String.valueOf(accountId));
                if (account != null) {
                    double accountBefore = JsValues.parseOrZero(account.get("amount"));
                    double accountAfter = accountBefore - billTotal;
                    depositMapper.updateAmount(String.valueOf(accountId), accountAfter);
                    insertTransaction(String.valueOf(accountId), "deduct", -billTotal, accountBefore, accountAfter,
                            "分期还款（" + itemName + "）-第" + period + "期", now);
                }
            }
            String depositItemId = String.valueOf(bill.get("deposit_item_id"));
            Map<String, Object> item = depositMapper.findItem(depositItemId);
            if (item != null) {
                double itemBefore = JsValues.parseOrZero(item.get("amount"));
                double remaining = installmentService.syncRemaining(depositItemId, String.valueOf(bill.get("plan_id")));
                insertTransaction(depositItemId, "add", billTotal, itemBefore, -remaining,
                        "分期还款-第" + period + "期", now);
            }
        }

        // 2) 普通欠债自动还款（花呗、美团月付等，仅 debt 类型且 repayment_mode=auto）
        for (Map<String, Object> item : depositMapper.listAutoDebtItems(todayDay)) {
            double currentBalance = JsValues.parseOrZero(item.get("amount"));
            if (currentBalance >= 0) {
                continue;
            }
            double repayAmount = Math.abs(currentBalance);
            String itemId = String.valueOf(item.get("id"));
            if (!depositMapper.findAutoRepayTransaction(itemId, LocalDate.now(ZoneOffset.UTC)
                    .atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli()).isEmpty()) {
                continue;
            }
            Object accountId = item.get("payment_account_id");
            Map<String, Object> account = depositMapper.findItem(String.valueOf(accountId));
            if (account == null) {
                continue;
            }
            double accountBalance = JsValues.parseOrZero(account.get("amount"));
            double newAccountBalance = accountBalance - repayAmount;
            depositMapper.updateAmount(String.valueOf(accountId), newAccountBalance);
            insertTransaction(String.valueOf(accountId), "deduct", -repayAmount, accountBalance, newAccountBalance,
                    "自动还款-" + JsValues.orEmpty(item.get("name")), now);
            depositMapper.zeroAmount(itemId);
            insertTransaction(itemId, "add", repayAmount, currentBalance, 0d, "自动还款", now);
        }
    }

    // ==================== 工具 ====================

    private void insertTransaction(String depositItemId, String type, double amount,
                                   double balanceBefore, double balanceAfter, String note, long createdAt) {
        relationGuard.validate("deposit_transactions", Map.of("deposit_item_id", depositItemId), 500);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", Ids.genId());
        data.put("depositItemId", depositItemId);
        data.put("type", type);
        data.put("amount", amount);
        data.put("balanceBefore", balanceBefore);
        data.put("balanceAfter", balanceAfter);
        data.put("note", note);
        data.put("createdAt", createdAt);
        depositMapper.insertTransaction(data);
    }

    private static String extname(String filename) {
        int index = filename.lastIndexOf('.');
        return index < 0 ? "" : filename.substring(index);
    }

    private static String base36() {
        return Long.toString((long) (Math.random() * 1_000_000_000L), 36);
    }

    private static String message(Exception error) {
        return error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
    }
}
