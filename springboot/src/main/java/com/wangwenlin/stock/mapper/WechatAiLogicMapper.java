package com.wangwenlin.stock.mapper;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.LinkedHashMap;
import java.util.List;

/**
 * 推荐逻辑训练样本与训练数据总览（GET /api/wechat/training-data）相关表访问。
 * 数字型列（DECIMAL / DATE）按 Node 端 mysql2 的返回形式取字符串，故 SQL 内显式转换。
 * SQL 内不写 user_id —— 由 TenantLineInnerInterceptor 自动注入（表已在 BusinessTables 白名单）。
 */
public interface WechatAiLogicMapper {

    /** 等价 Node 端 logic/train 的 INSERT ... ON DUPLICATE KEY UPDATE stocks_json = VALUES(stocks_json)。 */
    @Insert("INSERT INTO wechat_logic_training (event_id, original_text, stocks_json, sender, created_at) "
            + "VALUES (#{eventId}, #{originalText}, #{stocksJson}, #{sender}, #{createdAt}) "
            + "ON DUPLICATE KEY UPDATE stocks_json = VALUES(stocks_json)")
    int insertLogicTraining(@Param("eventId") String eventId,
                            @Param("originalText") String originalText,
                            @Param("stocksJson") String stocksJson,
                            @Param("sender") String sender,
                            @Param("createdAt") long createdAt);

    /** 等价 Node 端 training-data 的推荐逻辑样本查询。 */
    @Select("SELECT event_id, original_text, stocks_json, sender, created_at FROM wechat_logic_training "
            + "ORDER BY created_at DESC LIMIT #{limit} OFFSET #{offset}")
    List<LinkedHashMap<String, Object>> listLogicSamples(@Param("limit") long limit,
                                                         @Param("offset") long offset);

    /** 等价 Node 端 {@code SELECT COUNT(*) AS logicTotal FROM wechat_logic_training}。 */
    @Select("SELECT COUNT(*) FROM wechat_logic_training")
    long countLogicSamples();

    /** 等价 Node 端 training-data 的分类反馈查询。 */
    @Select("SELECT id, event_id, message_text, predicted_category, user_correct, user_corrected_category, "
            + "learned_keywords, created_at FROM wechat_category_feedback ORDER BY created_at DESC "
            + "LIMIT #{limit} OFFSET #{offset}")
    List<LinkedHashMap<String, Object>> listFeedbackSamples(@Param("limit") long limit,
                                                            @Param("offset") long offset);

    /** 等价 Node 端 {@code SELECT COUNT(*) AS fbTotal FROM wechat_category_feedback}。 */
    @Select("SELECT COUNT(*) FROM wechat_category_feedback")
    long countFeedbackSamples();

    /** 等价 Node 端 training-data 的学习规则查询。 */
    @Select("SELECT id, category, keyword, weight, correct_count, wrong_count, created_at "
            + "FROM wechat_category_rules ORDER BY created_at DESC LIMIT #{limit} OFFSET #{offset}")
    List<LinkedHashMap<String, Object>> listLearnedRulesForTraining(@Param("limit") long limit,
                                                                    @Param("offset") long offset);

    /** 等价 Node 端 {@code SELECT COUNT(*) AS lrTotal FROM wechat_category_rules}。 */
    @Select("SELECT COUNT(*) FROM wechat_category_rules")
    long countLearnedRulesForTraining();

    /** 等价 Node 端 training-data 的系统规则查询。 */
    @Select("SELECT id, category, rule_type, pattern, enabled, weight, description, created_at "
            + "FROM wechat_category_system_rules ORDER BY created_at DESC LIMIT #{limit} OFFSET #{offset}")
    List<LinkedHashMap<String, Object>> listSystemRulesForTraining(@Param("limit") long limit,
                                                                  @Param("offset") long offset);

    /** 等价 Node 端 {@code SELECT COUNT(*) AS srTotal FROM wechat_category_system_rules}。 */
    @Select("SELECT COUNT(*) FROM wechat_category_system_rules")
    long countSystemRulesForTraining();

    /**
     * 等价 Node 端 training-data 的追踪数据查询：DATE 列走 DATE_FORMAT，DECIMAL 列走 CAST AS CHAR，
     * 与 mysql2 的 dateStrings / DECIMAL 字符串返回保持一致。
     */
    @Select("SELECT id, event_id, sender, stock_code, stock_name, "
            + "DATE_FORMAT(pick_date, '%Y-%m-%d') AS pick_date, "
            + "CAST(pick_open_price AS CHAR) AS pick_open_price, "
            + "CAST(pick_close_price AS CHAR) AS pick_close_price, "
            + "CAST(pick_change_percent AS CHAR) AS pick_change_percent, "
            + "DATE_FORMAT(latest_date, '%Y-%m-%d') AS latest_date, "
            + "CAST(latest_close_price AS CHAR) AS latest_close_price, "
            + "CAST(total_change_percent AS CHAR) AS total_change_percent, "
            + "CAST(total_change_amount AS CHAR) AS total_change_amount, locked, pick_message "
            + "FROM wechat_tracking ORDER BY wechat_tracking.pick_date DESC LIMIT #{limit} OFFSET #{offset}")
    List<LinkedHashMap<String, Object>> listTrackingForTraining(@Param("limit") long limit,
                                                                @Param("offset") long offset);

    /** 等价 Node 端 {@code SELECT COUNT(*) AS trTotal FROM wechat_tracking}。 */
    @Select("SELECT COUNT(*) FROM wechat_tracking")
    long countTracking();
}
