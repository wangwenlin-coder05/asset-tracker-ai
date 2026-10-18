package com.wangwenlin.stock.mapper;

import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * 分期计划（installment_plans）与账单（installment_bills）表访问。
 * SQL 内不写 user_id —— 由租户拦截器自动注入。
 */
public interface InstallmentMapper {

    /** GET /api/installments/:depositItemId：ALL 列。 */
    List<Map<String, Object>> listPlans(@Param("depositItemId") String depositItemId);

    List<String> findPlanIds(@Param("depositItemId") String depositItemId);

    /** PUT /api/installments/:id：锁定计划，取 deposit_item_id。 */
    Map<String, Object> lockPlan(@Param("id") String id);

    void insertPlan(Map<String, Object> data);

    void updatePlan(Map<String, Object> data);

    void deletePlan(@Param("id") String id);

    void deleteBillsByPlan(@Param("planId") String planId);

    List<Map<String, Object>> listPlansForReconcile();

    /** 排期核对：period / due_date / status / paid_at。 */
    List<Map<String, Object>> listBillDates(@Param("planId") String planId);

    /** 重建排期前读取已付账单（period / due_date / paid_at）。 */
    List<Map<String, Object>> listPaidBills(@Param("planId") String planId);

    /** GET /api/installments/:planId/bills：ALL 列。 */
    List<Map<String, Object>> listBillsByPlan(@Param("planId") String planId);

    void insertBill(Map<String, Object> data);

    /** PUT /api/installments/bills/:id/pay：锁定账单。 */
    Map<String, Object> lockBill(@Param("id") String id);

    void markBillPaid(@Param("id") String id, @Param("paidAt") long paidAt);

    /** autoPayBills 第 1 段：到期未付账单（含付款账户与存款项名）。 */
    List<Map<String, Object>> listDueBills(@Param("today") String today);

    /** 剩余待付总额（SUM(total) WHERE status='pending'）。 */
    Map<String, Object> pendingTotal(@Param("planId") String planId);
}
