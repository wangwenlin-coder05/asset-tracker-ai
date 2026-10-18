package com.wangwenlin.stock.tenant;

import java.util.Set;

/**
 * 业务表白名单 —— 与 Node 端 backend/tenant-db.js 的 BUSINESS_TABLES 逐条对齐。
 * 只有白名单内的表才会被自动注入 user_id 租户条件；其余表（users、user_sessions 等）走原生连接，不参与租户裁剪。
 */
public final class BusinessTables {

    private static final Set<String> TABLES = Set.of(
            "ai_articles", "ai_logs", "ai_settings", "ai_usage", "buy_records", "daily_notes",
            "daily_plans", "daily_tasks", "daily_task_states", "deposit_items", "deposit_transactions", "extract_learn",
            "installment_bills", "installment_plans", "life_calendar_events", "life_change_logs", "life_chat_messages",
            "life_daily_tasks", "life_energy_logs", "life_future_paths", "life_knowledge", "life_persona",
            "life_persona_derived",
            "life_plan_nodes", "life_plan_rejects", "life_plan_snapshots", "life_retrieval_batches",
            "life_retrieval_cache", "life_retrieval_logs", "life_retrieval_queue",
            "life_skill_profile", "plan_completions", "quiz_answers",
            "quiz_questions", "sell_records", "stock_daily_analysis", "stock_daily_summary",
            "stock_notes", "stock_watchlist", "stocks", "tools", "tx_logs", "wechat_blacklist",
            "wechat_category_feedback", "wechat_category_rules", "wechat_category_system_rules",
            "wechat_events", "wechat_logic_training", "wechat_tracking", "wechat_tracking_daily",
            "wechat_whitelist", "wool_daily_amounts", "wool_items", "wool_notes"
    );

    private BusinessTables() {
    }

    public static boolean isBusiness(String table) {
        return table != null && TABLES.contains(table.toLowerCase());
    }

    public static Set<String> all() {
        return TABLES;
    }
}
