package com.wangwenlin.stock.common;

import com.wangwenlin.stock.mapper.RelationGuardMapper;
import com.wangwenlin.stock.tenant.UserContext;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 关联外键守卫 —— 对齐 Node 端 backend/tenant-db.js 的 validateRelations。
 * <p>
 * Node 侧把 INSERT / UPDATE / REPLACE 语句解析成 AST，若目标表在 RELATIONS 里有登记的外键列，
 * 且语句真的写了该列（值非 null 且非空串），就先按「父表 id + 当前用户」查一次，查不到即抛错。
 * 该错误的 statusCode=404，但各路由的 catch 分支用的是固定状态码，故这里由调用方传入 errorStatus。
 */
@Component
public class RelationGuard {

    /** 对齐 tenant-db.js 的 RELATIONS（只登记会写关联列的业务表）。 */
    private static final Map<String, Map<String, String>> RELATIONS = relations();

    private final RelationGuardMapper mapper;

    public RelationGuard(RelationGuardMapper mapper) {
        this.mapper = mapper;
    }

    /**
     * @param table       本次写入的目标业务表
     * @param columns     本次写入的「列名 → 值」；只有 RELATIONS 登记的列会被检查
     * @param errorStatus 该路由 catch 分支使用的 HTTP 状态码
     */
    public void validate(String table, Map<String, Object> columns, int errorStatus) {
        Map<String, String> relations = RELATIONS.get(table);
        if (relations == null || columns == null || columns.isEmpty()) {
            return;
        }
        long userId = UserContext.requireUserId();
        for (Map.Entry<String, String> relation : relations.entrySet()) {
            Object value = columns.get(relation.getKey());
            // 对齐 JS：AST 节点 type 为 null，或 value 为空串时跳过
            if (value == null || "".equals(value)) {
                continue;
            }
            // 对齐 JS：只接受单引号串 / 双引号串 / 数字三类字面量，其余视为不支持的表达式
            if (!(value instanceof String) && !(value instanceof Number)) {
                throw new ApiException(errorStatus, "不支持的关联字段表达式");
            }
            if (mapper.exists(relation.getValue(), value, userId) == null) {
                throw new ApiException(errorStatus, "关联记录不存在或不属于当前账号");
            }
        }
    }

    private static Map<String, Map<String, String>> relations() {
        Map<String, Map<String, String>> map = new LinkedHashMap<>();
        map.put("deposit_items", one("payment_account_id", "deposit_items"));
        map.put("deposit_transactions", one("deposit_item_id", "deposit_items"));
        map.put("installment_plans", one("deposit_item_id", "deposit_items"));
        map.put("installment_bills", one("plan_id", "installment_plans"));
        map.put("wool_items", two("deposit_item_id", "deposit_items", "deposit_transaction_id", "deposit_transactions"));
        map.put("buy_records", one("stock_id", "stocks"));
        map.put("sell_records", one("stock_id", "stocks"));
        map.put("tx_logs", one("stock_id", "stocks"));
        map.put("stock_daily_analysis", one("watch_id", "stock_watchlist"));
        map.put("daily_task_states", one("task_id", "daily_tasks"));
        map.put("plan_completions", one("plan_id", "daily_plans"));
        map.put("quiz_answers", one("question_id", "quiz_questions"));
        return map;
    }

    private static Map<String, String> one(String column, String table) {
        Map<String, String> map = new LinkedHashMap<>();
        map.put(column, table);
        return map;
    }

    private static Map<String, String> two(String column1, String table1, String column2, String table2) {
        Map<String, String> map = new LinkedHashMap<>();
        map.put(column1, table1);
        map.put(column2, table2);
        return map;
    }
}
