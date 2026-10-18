package com.wangwenlin.stock.mapper;

import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * ai_logs / ai_usage 表访问 —— 对齐 Node 端 server.js 中 AI 日志与使用统计相关 SQL。
 * SQL 内不写 user_id —— 由 TenantLineInnerInterceptor 自动注入。
 */
public interface AiLogMapper {

    /** GET /api/ai/logs：明细列表。created_at 用 CAST 成字符串，与 mysql2 dateStrings 输出一致。 */
    List<Map<String, Object>> list(@Param("limit") int limit, @Param("offset") int offset);

    /** GET /api/ai/logs：总数。 */
    long countAll();

    /** GET /api/ai/usage：累计成功调用数（{@code WHERE success = 1}）。 */
    long countSuccess();

    /** GET /api/ai/usage：指定日期（UTC）成功调用数。 */
    long countSuccessOnDate(@Param("date") String date);

    /** GET /api/ai/usage：指定日期按模型分布。 */
    List<Map<String, Object>> successByModelOnDate(@Param("date") String date);

    /** GET /api/ai/usage：近 7 天成功调用趋势（DATE(created_at) 字符串 + 计数）。 */
    List<Map<String, Object>> successTrend();

    /**
     * 写入一条 AI 调用日志。data 中 requestContent / responseContent 有则写入对应列，
     * 无则省略该列 —— 对齐 Node 端可变列 INSERT。
     */
    Integer insertLog(Map<String, Object> data);

    /** 成功调用计数 +1（ai_usage 表，date+model 唯一键上累加）。 */
    Integer upsertUsage(@Param("date") String date, @Param("model") String model);
}
