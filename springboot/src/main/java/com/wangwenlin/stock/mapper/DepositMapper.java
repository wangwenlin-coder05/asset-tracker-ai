package com.wangwenlin.stock.mapper;

import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * 存款项（deposit_items）与资金明细（deposit_transactions）表访问。
 * SQL 内不写 user_id —— 由租户拦截器自动注入，与 Node 端行为一致。
 */
public interface DepositMapper {

    /** GET /api/deposits：存款项左连分期计划。 */
    List<Map<String, Object>> listItemsWithPlan();

    /** POST /api/deposits/:id/transactions：取当前余额。 */
    Map<String, Object> findItem(@Param("id") String id);

    /** POST /api/deposits/:id/repay：锁定欠款项。 */
    Map<String, Object> lockDebt(@Param("id") String id);

    /** 分期还款时锁定付款账户。 */
    Map<String, Object> lockAccount(@Param("id") String id);

    /** 分期还款时锁定记账金额的行。 */
    Map<String, Object> lockAmount(@Param("id") String id);

    /** POST /api/installments：锁定存款项。 */
    String lockItemId(@Param("id") String id);

    void insertItem(Map<String, Object> data);

    void updateFields(Map<String, Object> data);

    void updateAmount(@Param("id") String id, @Param("amount") Object amount);

    void updateItemTypeAndAmount(@Param("id") String id, @Param("amount") Object amount);

    void zeroAmount(@Param("id") String id);

    void moveItem(@Param("id") String id, @Param("groupName") Object groupName, @Param("sortOrder") Object sortOrder);

    void deleteItem(@Param("id") String id);

    /** GET /api/deposits/:id/transactions：ALL 列，DECIMAL 以原始字符串返回。 */
    List<Map<String, Object>> listTransactions(@Param("depositItemId") String depositItemId);

    void insertTransaction(Map<String, Object> data);

    /** autoPayBills 第 2 段：到期自动还款的花呗/月付类欠款。 */
    List<Map<String, Object>> listAutoDebtItems(@Param("repaymentDay") Object repaymentDay);

    /** autoPayBills：判断今天是否已自动还款过。 */
    List<String> findAutoRepayTransaction(@Param("depositItemId") String depositItemId, @Param("since") long since);
}
