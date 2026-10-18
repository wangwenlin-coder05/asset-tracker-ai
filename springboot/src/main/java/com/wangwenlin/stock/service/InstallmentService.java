package com.wangwenlin.stock.service;

import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.common.Ids;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.common.RelationGuard;
import com.wangwenlin.stock.mapper.DepositMapper;
import com.wangwenlin.stock.mapper.InstallmentMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 分期还款 API —— 与 Node 端 server.js 的 /api/installments/* 逐行对齐（6 个路由）+ 启动时的排期自愈。
 * 对外提供 syncRemaining（存款项待还金额回写），供 DepositService 的 autoPayBills 复用。
 */
@Service
public class InstallmentService {

    private final InstallmentMapper installmentMapper;
    private final DepositMapper depositMapper;
    private final RelationGuard relationGuard;
    private final TransactionTemplate transactionTemplate;

    public InstallmentService(InstallmentMapper installmentMapper,
                              DepositMapper depositMapper,
                              RelationGuard relationGuard,
                              org.springframework.transaction.PlatformTransactionManager transactionManager) {
        this.installmentMapper = installmentMapper;
        this.depositMapper = depositMapper;
        this.relationGuard = relationGuard;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    // ==================== 入参校验（对齐 validateInstallmentPayload）====================

    public static final class PlanPayload {
        final double totalPrincipal;
        final double totalInterest;
        final int installments;
        final int monthlyDay;
        final String startDate;
        final Object paymentAccountId;

        PlanPayload(double totalPrincipal, double totalInterest, int installments,
                    int monthlyDay, String startDate, Object paymentAccountId) {
            this.totalPrincipal = totalPrincipal;
            this.totalInterest = totalInterest;
            this.installments = installments;
            this.monthlyDay = monthlyDay;
            this.startDate = startDate;
            this.paymentAccountId = paymentAccountId;
        }
    }

    public PlanPayload validatePayload(Map<String, Object> body) {
        Double totalPrincipal = JsValues.parse(body.get("totalPrincipal"));
        Object rawInterest = body.get("totalInterest");
        Double totalInterest = JsValues.parse(JsValues.truthy(rawInterest) ? rawInterest : 0);
        Long installments = JsValues.parseIntOrNull(JsValues.toJsString(body.get("installments")));
        Long monthlyDay = JsValues.parseIntOrNull(JsValues.toJsString(body.get("monthlyDay")));
        String startDate = JsValues.truthy(body.get("startDate")) ? JsValues.toJsString(body.get("startDate")) : "";
        if (totalPrincipal == null || totalPrincipal <= 0) {
            throw new IllegalArgumentException("总金额必须大于 0");
        }
        if (totalInterest == null || totalInterest < 0) {
            throw new IllegalArgumentException("总利息不能小于 0");
        }
        if (installments == null || installments < 1 || installments > 360) {
            throw new IllegalArgumentException("分期数必须在 1 到 360 之间");
        }
        if (monthlyDay == null || monthlyDay < 1 || monthlyDay > 28) {
            throw new IllegalArgumentException("每月还款日必须在 1 到 28 之间");
        }
        if (!startDate.matches("^\\d{4}-\\d{2}-\\d{2}$")) {
            throw new IllegalArgumentException("请选择有效的开始日期");
        }
        Object accountId = JsValues.truthyOrNull(body.get("paymentAccountId"));
        return new PlanPayload(totalPrincipal, totalInterest, installments.intValue(),
                monthlyDay.intValue(), startDate, accountId == null ? "" : accountId);
    }

    // ==================== 排期生成（对齐 buildInstallmentSchedule）====================

    public static final class Bill {
        final int period;
        final String dueDate;
        final double principal;
        final double interest;
        final double total;

        Bill(int period, String dueDate, double principal, double interest, double total) {
            this.period = period;
            this.dueDate = dueDate;
            this.principal = principal;
            this.interest = interest;
            this.total = total;
        }
    }

    public List<Bill> buildSchedule(PlanPayload plan) {
        // 注意：Math.round 返回 long，必须 /100d 才能保持 JS 的浮点除法语义（/100 会变成整数除法截断）
        double perPrincipal = Math.floor((plan.totalPrincipal / plan.installments) * 100) / 100d;
        double perInterest = Math.floor((plan.totalInterest / plan.installments) * 100) / 100d;
        double lastPrincipal = Math.round((plan.totalPrincipal - perPrincipal * (plan.installments - 1)) * 100) / 100d;
        double lastInterest = Math.round((plan.totalInterest - perInterest * (plan.installments - 1)) * 100) / 100d;
        String[] parts = plan.startDate.split("-", -1);
        int startYear = Integer.parseInt(parts[0]);
        int startMonth = Integer.parseInt(parts[1]);
        int startDay = Integer.parseInt(parts[2]);
        int firstMonth = startMonth;
        int firstYear = startYear;
        if (startDay > plan.monthlyDay) {
            firstMonth++;
            if (firstMonth > 12) {
                firstMonth = 1;
                firstYear++;
            }
        }
        List<Bill> bills = new ArrayList<>(plan.installments);
        for (int index = 0; index < plan.installments; index++) {
            int month = firstMonth + index;
            int year = firstYear;
            while (month > 12) {
                month -= 12;
                year++;
            }
            int day = Math.min(plan.monthlyDay, YearMonth.of(year, month).lengthOfMonth());
            String dueDate = year + "-" + pad2(month) + "-" + pad2(day);
            boolean isLast = index == plan.installments - 1;
            double principal = isLast ? lastPrincipal : perPrincipal;
            double interest = isLast ? lastInterest : perInterest;
            bills.add(new Bill(index + 1, dueDate, principal, interest,
                    Math.round((principal + interest) * 100) / 100d));
        }
        return bills;
    }

    private void insertBills(String planId, PlanPayload plan, Map<String, Long> paidByDueDate) {
        long now = System.currentTimeMillis();
        for (Bill bill : buildSchedule(plan)) {
            Long paidAt = paidByDueDate.get(bill.dueDate);
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("id", Ids.genId());
            data.put("planId", planId);
            data.put("period", bill.period);
            data.put("dueDate", bill.dueDate);
            data.put("principal", bill.principal);
            data.put("interest", bill.interest);
            data.put("total", bill.total);
            data.put("status", paidAt != null ? "paid" : "pending");
            data.put("paidAt", paidAt == null ? 0L : paidAt);
            data.put("createdAt", now);
            installmentMapper.insertBill(data);
        }
    }

    /** 对齐 syncInstallmentRemainingAmount：回写存款项待还金额并返回 remaining。 */
    public double syncRemaining(String depositItemId, String planId) {
        Map<String, Object> row = installmentMapper.pendingTotal(planId);
        double remaining = Math.round(JsValues.parseOrZero(row == null ? null : row.get("remaining")) * 100) / 100d;
        depositMapper.updateItemTypeAndAmount(depositItemId, -remaining);
        return remaining;
    }

    // ==================== 路由：GET /api/installments/:depositItemId ====================

    public Object getPlan(String depositItemId) {
        List<Map<String, Object>> rows = installmentMapper.listPlans(depositItemId);
        if (rows.isEmpty()) {
            return com.fasterxml.jackson.databind.node.NullNode.getInstance();
        }
        Map<String, Object> row = rows.get(0);
        LinkedHashMap<String, Object> plan = new LinkedHashMap<>();
        plan.put("id", row.get("id"));
        plan.put("deposit_item_id", row.get("deposit_item_id"));
        plan.put("total_principal", JsValues.parse(row.get("total_principal")));
        plan.put("total_interest", JsValues.parse(row.get("total_interest")));
        plan.put("installments", row.get("installments"));
        plan.put("monthly_day", row.get("monthly_day"));
        plan.put("start_date", row.get("start_date"));
        plan.put("payment_account_id", row.get("payment_account_id"));
        plan.put("created_at", row.get("created_at"));
        plan.put("user_id", row.get("user_id"));
        return plan;
    }

    // ==================== 路由：POST /api/installments ====================

    /** 返回 {id}，或抛出 ApiException（400/404/409）。 */
    @Transactional
    public Map<String, Object> create(Map<String, Object> body) {
        String depositItemId = JsValues.truthy(body.get("depositItemId"))
                ? JsValues.toJsString(body.get("depositItemId")) : "";
        PlanPayload plan;
        try {
            plan = validatePayload(body);
        } catch (IllegalArgumentException error) {
            throw new ApiException(400, error.getMessage());
        }
        if (depositItemId.isEmpty()) {
            throw new ApiException(400, "缺少存款项 ID");
        }
        if (depositMapper.lockItemId(depositItemId) == null) {
            throw new ApiException(404, "存款项不存在");
        }
        if (!installmentMapper.findPlanIds(depositItemId).isEmpty()) {
            throw new ApiException(409, "该存款项已存在分期计划");
        }
        String planId = Ids.genId();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", planId);
        data.put("depositItemId", depositItemId);
        data.put("totalPrincipal", plan.totalPrincipal);
        data.put("totalInterest", plan.totalInterest);
        data.put("installments", plan.installments);
        data.put("monthlyDay", plan.monthlyDay);
        data.put("startDate", plan.startDate);
        data.put("paymentAccountId", plan.paymentAccountId);
        data.put("createdAt", System.currentTimeMillis());
        relationGuard.validate("installment_plans", Map.of("deposit_item_id", depositItemId), 400);
        installmentMapper.insertPlan(data);
        insertBills(planId, plan, Map.of());
        syncRemaining(depositItemId, planId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", planId);
        return result;
    }

    // ==================== 路由：PUT /api/installments/:id ====================

    @Transactional
    public Map<String, Object> update(String id, Map<String, Object> body) {
        PlanPayload plan;
        try {
            plan = validatePayload(body);
        } catch (IllegalArgumentException error) {
            throw new ApiException(400, error.getMessage());
        }
        Map<String, Object> locked = installmentMapper.lockPlan(id);
        if (locked == null) {
            throw new ApiException(404, "分期计划不存在");
        }
        Map<String, Long> paidBills = new HashMap<>();
        for (Map<String, Object> row : installmentMapper.listPaidBills(id)) {
            String dueDate = row.get("due_date") == null ? null : String.valueOf(row.get("due_date"));
            if (dueDate != null) {
                paidBills.put(dueDate, paidAtOf(row.get("paid_at")));
            }
        }
        installmentMapper.deleteBillsByPlan(id);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", id);
        data.put("totalPrincipal", plan.totalPrincipal);
        data.put("totalInterest", plan.totalInterest);
        data.put("installments", plan.installments);
        data.put("monthlyDay", plan.monthlyDay);
        data.put("startDate", plan.startDate);
        data.put("paymentAccountId", plan.paymentAccountId);
        installmentMapper.updatePlan(data);
        insertBills(id, plan, paidBills);
        syncRemaining(String.valueOf(locked.get("deposit_item_id")), id);
        return Map.of("success", true);
    }

    // ==================== 路由：DELETE /api/installments/:id ====================

    public Map<String, Object> delete(String id) {
        installmentMapper.deleteBillsByPlan(id);
        installmentMapper.deletePlan(id);
        return Map.of("success", true);
    }

    // ==================== 路由：GET /api/installments/:planId/bills ====================

    public List<Map<String, Object>> listBills(String planId) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : installmentMapper.listBillsByPlan(planId)) {
            LinkedHashMap<String, Object> bill = new LinkedHashMap<>();
            bill.put("id", row.get("id"));
            bill.put("planId", row.get("plan_id"));
            bill.put("period", row.get("period"));
            bill.put("dueDate", row.get("due_date"));
            bill.put("principal", JsValues.parse(row.get("principal")));
            bill.put("interest", JsValues.parse(row.get("interest")));
            bill.put("total", JsValues.parse(row.get("total")));
            bill.put("status", row.get("status"));
            bill.put("paidAt", row.get("paid_at"));
            out.add(bill);
        }
        return out;
    }

    // ==================== 路由：PUT /api/installments/bills/:id/pay ====================

    /** 手动标记账单已付：返回 {success, remaining} 或 {success, alreadyPaid}。 */
    @Transactional
    public Map<String, Object> payBill(String id) {
        return payBillInternal(id, true);
    }

    /**
     * @param manual true = 用户点击（账单不存在时 404）；false = autoPayBills 批量（账单不存在时直接跳过）
     */
    @Transactional
    public Map<String, Object> payBillInternal(String id, boolean manual) {
        long now = System.currentTimeMillis();
        Map<String, Object> bill = installmentMapper.lockBill(id);
        if (bill == null) {
            if (manual) {
                throw new ApiException(404, "账单不存在");
            }
            return Map.of();
        }
        if ("paid".equals(String.valueOf(bill.get("status")))) {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("success", true);
            result.put("alreadyPaid", true);
            return result;
        }
        installmentMapper.markBillPaid(id, now);
        double billTotal = JsValues.parseOrZero(bill.get("total"));
        int period = (int) JsValues.parseOrZero(bill.get("period"));
        String itemName = bill.get("item_name") == null ? "" : String.valueOf(bill.get("item_name"));
        Object accountId = bill.get("payment_account_id");
        if (JsValues.truthy(accountId)) {
            Map<String, Object> account = depositMapper.lockAccount(String.valueOf(accountId));
            if (account != null) {
                double accountBefore = JsValues.parseOrZero(account.get("amount"));
                double accountAfter = accountBefore - billTotal;
                depositMapper.updateAmount(String.valueOf(accountId), accountAfter);
                insertTransaction(String.valueOf(accountId), "deduct", -billTotal, accountBefore, accountAfter,
                        "分期还款（" + itemName + "）-第" + period + "期", now);
            }
        }
        String depositItemId = String.valueOf(bill.get("deposit_item_id"));
        Map<String, Object> item = depositMapper.lockAmount(depositItemId);
        double itemBefore = item == null ? 0 : JsValues.parseOrZero(item.get("amount"));
        double remaining = syncRemaining(depositItemId, String.valueOf(bill.get("plan_id")));
        insertTransaction(depositItemId, "add", billTotal, itemBefore, -remaining,
                "分期还款-第" + period + "期", now);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("remaining", remaining);
        return result;
    }

    private void insertTransaction(String depositItemId, String type, double amount,
                                   double balanceBefore, double balanceAfter, String note, long createdAt) {
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

    // ==================== 启动时的排期自愈（对齐 reconcileInstallmentSchedules）====================

    public void reconcile() {
        for (Map<String, Object> row : installmentMapper.listPlansForReconcile()) {
            String planId = String.valueOf(row.get("id"));
            String depositItemId = String.valueOf(row.get("deposit_item_id"));
            PlanPayload plan = new PlanPayload(
                    JsValues.parseOrZero(row.get("total_principal")),
                    JsValues.parseOrZero(row.get("total_interest")),
                    (int) JsValues.parseOrZero(row.get("installments")),
                    (int) JsValues.parseOrZero(row.get("monthly_day")),
                    row.get("start_date") == null ? "" : String.valueOf(row.get("start_date")),
                    row.get("payment_account_id"));
            List<Bill> expected = buildSchedule(plan);
            List<Map<String, Object>> current = installmentMapper.listBillDates(planId);
            boolean changed = current.size() != expected.size();
            if (!changed) {
                for (int index = 0; index < expected.size(); index++) {
                    Object dueDate = current.get(index).get("due_date");
                    if (!expected.get(index).dueDate.equals(dueDate == null ? null : String.valueOf(dueDate))) {
                        changed = true;
                        break;
                    }
                }
            }
            final boolean needsRepair = changed;
            transactionTemplate.executeWithoutResult(status -> {
                if (needsRepair) {
                    Map<String, Long> paidByDueDate = new HashMap<>();
                    for (Map<String, Object> item : current) {
                        if ("paid".equals(String.valueOf(item.get("status")))) {
                            paidByDueDate.put(String.valueOf(item.get("due_date")), paidAtOf(item.get("paid_at")));
                        }
                    }
                    installmentMapper.deleteBillsByPlan(planId);
                    insertBills(planId, plan, paidByDueDate);
                }
                syncRemaining(depositItemId, planId);
            });
        }
    }

    // ==================== 工具 ====================

    private static String pad2(int value) {
        return value < 10 ? "0" + value : String.valueOf(value);
    }

    /** 等价 JS 的 {@code paid_at || 0}：0 与 null 都归零。 */
    private static long paidAtOf(Object value) {
        double parsed = JsValues.parseOrZero(value);
        return parsed == 0 ? 0L : (long) parsed;
    }
}
