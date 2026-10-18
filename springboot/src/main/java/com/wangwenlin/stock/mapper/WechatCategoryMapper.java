package com.wangwenlin.stock.mapper;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 微信公众号消息分类 / 学习规则相关表访问。
 * SQL 内不写 user_id —— 由 TenantLineInnerInterceptor 自动注入（表已在 BusinessTables 白名单）。
 */
public interface WechatCategoryMapper {

    /** 等价 Node 端 {@code SELECT * FROM wechat_category_system_rules WHERE enabled = 1}。 */
    @Select("SELECT * FROM wechat_category_system_rules WHERE enabled = 1")
    List<Map<String, Object>> listEnabledSystemRules();

    /**
     * 等价 Node 端 {@code SELECT id, category, rule_type, pattern, enabled, weight, description, created_at,
     * updated_at FROM wechat_category_system_rules ORDER BY category, id}（分类规则快照用，列顺序需与 Node 一致）。
     */
    @Select("SELECT id, category, rule_type, pattern, enabled, weight, description, created_at, updated_at "
            + "FROM wechat_category_system_rules ORDER BY category, id")
    List<Map<String, Object>> listSystemRules();

    /**
     * 等价 Node 端 {@code SELECT id, category, keyword, weight, correct_count, wrong_count, created_at,
     * updated_at FROM wechat_category_rules ORDER BY category, weight DESC}。
     */
    @Select("SELECT id, category, keyword, weight, correct_count, wrong_count, created_at, updated_at "
            + "FROM wechat_category_rules ORDER BY category, weight DESC")
    List<Map<String, Object>> listLearnedRules();

    /** 等价 Node 端 {@code SELECT COUNT(*) AS cnt FROM wechat_category_rules}。 */
    @Select("SELECT COUNT(*) AS cnt FROM wechat_category_rules")
    Map<String, Object> countLearnedRules();

    /**
     * 等价 Node 端 {@code SELECT message_text, CASE WHEN user_correct = 1 THEN predicted_category
     * ELSE user_corrected_category END AS category FROM wechat_category_feedback WHERE user_correct IN (0,1)
     * AND message_text IS NOT NULL AND message_text != '' ORDER BY created_at DESC LIMIT 600}。
     */
    @Select("SELECT message_text, CASE WHEN user_correct = 1 THEN predicted_category "
            + "ELSE user_corrected_category END AS category FROM wechat_category_feedback "
            + "WHERE user_correct IN (0,1) AND message_text IS NOT NULL AND message_text != '' "
            + "ORDER BY created_at DESC LIMIT 600")
    List<Map<String, Object>> listFeedbackExamples();

    /**
     * 等价 Node 端 {@code SELECT * FROM extract_learn WHERE ? LIKE CONCAT('%', source_text, '%')
     * ORDER BY (source_text = ?) DESC, hit_count DESC, id DESC LIMIT 1}。
     */
    @Select("SELECT * FROM extract_learn WHERE #{q} LIKE CONCAT('%', source_text, '%') "
            + "ORDER BY (source_text = #{q}) DESC, hit_count DESC, id DESC LIMIT 1")
    Map<String, Object> queryExtractLearn(@Param("q") String q);

    /** 等价 Node 端 {@code DELETE FROM wechat_category_rules WHERE correct_count = 0 AND wrong_count > 3}。 */
    @Delete("DELETE FROM wechat_category_rules WHERE correct_count = 0 AND wrong_count > 3")
    int deleteNoisyRules();

    /**
     * 等价 Node 端 {@code DELETE FROM wechat_category_rules WHERE (correct_count + wrong_count) >= 5
     * AND correct_count * 5 < (correct_count + wrong_count)}。
     */
    @Delete("DELETE FROM wechat_category_rules WHERE (correct_count + wrong_count) >= 5 "
            + "AND correct_count * 5 < (correct_count + wrong_count)")
    int deleteLowAccuracyRules();

    /**
     * 等价 Node 端 {@code DELETE FROM wechat_category_rules WHERE (correct_count + wrong_count) = 0
     * AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)}。
     */
    @Delete("DELETE FROM wechat_category_rules WHERE (correct_count + wrong_count) = 0 "
            + "AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)")
    int deleteEmptyRules();

    /** 等价 Node 端 {@code UPDATE wechat_category_rules SET weight = 10 WHERE weight > 10}。 */
    @Update("UPDATE wechat_category_rules SET weight = 10 WHERE weight > 10")
    int capPositiveWeights();

    /** 等价 Node 端 {@code UPDATE wechat_category_rules SET weight = -10 WHERE weight < -10}。 */
    @Update("UPDATE wechat_category_rules SET weight = -10 WHERE weight < -10")
    int capNegativeWeights();

    /**
     * 等价 Node 端
     * {@code INSERT INTO wechat_category_rules (category, keyword, weight, correct_count, wrong_count,
     * created_at, updated_at) VALUES (?,?,?,?,?,now,now) ON DUPLICATE KEY UPDATE
     * weight = weight + VALUES(weight), correct_count = correct_count + VALUES(correct_count),
     * wrong_count = wrong_count + VALUES(wrong_count), updated_at = now}。
     */
    @Insert("INSERT INTO wechat_category_rules (category, keyword, weight, correct_count, wrong_count, "
            + "created_at, updated_at) VALUES (#{category}, #{keyword}, #{weight}, #{correctCount}, "
            + "#{wrongCount}, #{now}, #{now}) ON DUPLICATE KEY UPDATE weight = weight + VALUES(weight), "
            + "correct_count = correct_count + VALUES(correct_count), "
            + "wrong_count = wrong_count + VALUES(wrong_count), updated_at = #{now}")
    void upsertCategoryRule(@Param("category") String category,
                            @Param("keyword") String keyword,
                            @Param("weight") int weight,
                            @Param("correctCount") int correctCount,
                            @Param("wrongCount") int wrongCount,
                            @Param("now") long now);

    // ==================== 分类反馈 / 规则管理 / 提取学习 ====================

    /** 等价 Node 端 POST /api/wechat/category-feedback 的 INSERT（回填自增 id）。 */
    @Insert("INSERT INTO wechat_category_feedback (event_id, message_text, predicted_category, "
            + "user_correct, user_corrected_category, learned_keywords, created_at) "
            + "VALUES (#{eventId}, #{messageText}, #{predictedCategory}, #{userCorrect}, "
            + "#{userCorrectedCategory}, #{learnedKeywords}, #{createdAt})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertFeedback(Map<String, Object> data);

    /** 等价 Node 端 POST /api/wechat/category-rules/system/reset 的 DELETE。 */
    @Delete("DELETE FROM wechat_category_system_rules")
    int deleteAllSystemRules();

    /** 等价 Node 端 reset 的逐条 INSERT。 */
    @Insert("INSERT INTO wechat_category_system_rules (category, rule_type, pattern, enabled, weight, "
            + "description, created_at, updated_at) VALUES (#{category}, #{ruleType}, #{pattern}, "
            + "#{enabled}, #{weight}, #{description}, #{now}, #{now})")
    int insertSystemRule(@Param("category") String category,
                         @Param("ruleType") String ruleType,
                         @Param("pattern") String pattern,
                         @Param("enabled") int enabled,
                         @Param("weight") int weight,
                         @Param("description") String description,
                         @Param("now") long now);

    /**
     * 等价 Node 端 PUT /api/wechat/category-rules/system/:id。
     * Node 端传参为 {@code [...values, Date.now()]}，对应 {@code SET ..., updated_at = ? WHERE id = ?}，
     * 即 updated_at 实际写入 id、WHERE 实际比较 Date.now()（永不命中）；此处按原样复刻。
     */
    @Update("<script>UPDATE wechat_category_system_rules SET "
            + "<if test='hasEnabled'>enabled = #{enabled}, </if>"
            + "<if test='hasWeight'>weight = #{weight}, </if>"
            + "<if test='hasDescription'>description = #{description}, </if>"
            + "updated_at = #{updatedAt} WHERE id = #{whereId}</script>")
    int updateSystemRule(@Param("hasEnabled") boolean hasEnabled,
                         @Param("enabled") Integer enabled,
                         @Param("hasWeight") boolean hasWeight,
                         @Param("weight") Double weight,
                         @Param("hasDescription") boolean hasDescription,
                         @Param("description") Object description,
                         @Param("updatedAt") Object updatedAt,
                         @Param("whereId") Object whereId);

    /** 等价 Node 端 DELETE /api/wechat/category-rules/learned/:id。 */
    @Delete("DELETE FROM wechat_category_rules WHERE id = #{id}")
    int deleteLearnedRuleById(@Param("id") String id);

    /** 等价 Node 端 POST /api/wechat/category-rules/learned 的 UPSERT。 */
    @Insert("INSERT INTO wechat_category_rules (category, keyword, weight, correct_count, wrong_count, "
            + "created_at, updated_at) VALUES (#{category}, #{keyword}, #{weight}, 0, 0, #{now}, #{now}) "
            + "ON DUPLICATE KEY UPDATE weight = VALUES(weight), updated_at = #{now}")
    int upsertCustomLearnedRule(@Param("category") String category,
                                @Param("keyword") String keyword,
                                @Param("weight") double weight,
                                @Param("now") long now);

    /** 等价 Node 端 GET /api/extract/learn 的明细查询（列顺序需与 Node 一致）。 */
    @Select("SELECT id, source_text, wrong_label, correct_label, wrong_code, correct_code, hit_count "
            + "FROM extract_learn WHERE #{q} LIKE CONCAT('%', source_text, '%') "
            + "ORDER BY (source_text = #{q}) DESC, hit_count DESC, id DESC")
    List<LinkedHashMap<String, Object>> listExtractLearn(@Param("q") String q);

    /** 等价 Node 端 POST /api/extract/learn 的 {@code SELECT id, hit_count}。 */
    @Select("SELECT id, hit_count FROM extract_learn WHERE source_text = #{src}")
    List<LinkedHashMap<String, Object>> findExtractLearnBySource(@Param("src") String src);

    /** 等价 Node 端 POST /api/extract/learn 已存在分支的 UPDATE。 */
    @Update("UPDATE extract_learn SET correct_label = #{correctLabel}, correct_code = #{correctCode}, "
            + "wrong_label = #{wrongLabel}, wrong_code = #{wrongCode}, updated_at = #{updatedAt} "
            + "WHERE id = #{id}")
    int updateExtractLearn(@Param("correctLabel") String correctLabel,
                           @Param("correctCode") String correctCode,
                           @Param("wrongLabel") String wrongLabel,
                           @Param("wrongCode") String wrongCode,
                           @Param("updatedAt") long updatedAt,
                           @Param("id") Integer id);

    /** 等价 Node 端 POST /api/extract/learn 已存在分支的 hit_count + 1。 */
    @Update("UPDATE extract_learn SET hit_count = hit_count + 1 WHERE id = #{id}")
    int bumpExtractLearnHit(@Param("id") Integer id);

    /** 等价 Node 端 POST /api/extract/learn 插入新记忆。 */
    @Insert("INSERT INTO extract_learn (source_text, wrong_label, correct_label, wrong_code, correct_code, "
            + "hit_count, created_at, updated_at) VALUES (#{sourceText}, #{wrongLabel}, #{correctLabel}, "
            + "#{wrongCode}, #{correctCode}, 1, #{now}, #{now})")
    int insertExtractLearn(@Param("sourceText") String sourceText,
                           @Param("wrongLabel") String wrongLabel,
                           @Param("correctLabel") String correctLabel,
                           @Param("wrongCode") String wrongCode,
                           @Param("correctCode") String correctCode,
                           @Param("now") long now);

    /** 等价 Node 端 POST /api/wechat/reclassify 的 {@code SELECT id, message_text, stocks_json, category, is_manual}。 */
    @Select("SELECT id, message_text, stocks_json, category, is_manual FROM wechat_events ORDER BY created_at DESC")
    List<LinkedHashMap<String, Object>> listEventsForReclassify();

    /** 等价 Node 端 reclassify 的 {@code UPDATE wechat_events SET category = ? WHERE id = ?}。 */
    @Update("UPDATE wechat_events SET category = #{category} WHERE id = #{id}")
    int updateEventCategory(@Param("id") String id, @Param("category") String category);
}
