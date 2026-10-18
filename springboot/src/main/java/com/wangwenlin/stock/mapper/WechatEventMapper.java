package com.wangwenlin.stock.mapper;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;
import java.util.Map;

/**
 * wechat_events 表读写。等价 wechat-extractor.js / server.js 中相应 SQL，
 * 租户 user_id 由 TenantLineInnerInterceptor 自动注入，SQL 中不出现 user_id。
 */
@Mapper
public interface WechatEventMapper {

    @Select("SELECT * FROM wechat_events ORDER BY created_at DESC")
    List<Map<String, Object>> listAll();

    @Select("SELECT * FROM wechat_events WHERE id = #{id} LIMIT 1")
    Map<String, Object> findById(@Param("id") String id);

    @Select("SELECT id, chat_name, sender, message_text, message_time, captured_at, category, stocks_json, created_at"
            + " FROM wechat_events WHERE id = #{id} LIMIT 1")
    Map<String, Object> findMetaById(@Param("id") String id);

    @Select("SELECT id, stocks_json, category FROM wechat_events WHERE id = #{id} LIMIT 1")
    Map<String, Object> findStocksUsageRow(@Param("id") String id);

    @Select("SELECT id FROM wechat_events WHERE category = #{category}")
    List<Map<String, Object>> listIdsByCategory(@Param("category") String category);

    @Select("SELECT * FROM wechat_events WHERE category = 'stock_pick' AND stocks_json != '[]' AND stocks_json IS NOT NULL ORDER BY created_at DESC LIMIT 200")
    List<Map<String, Object>> listRecentPicks();

    @Select("SELECT * FROM wechat_events WHERE category = 'stock_pick' AND stocks_json != '[]' AND stocks_json IS NOT NULL ORDER BY created_at DESC")
    List<Map<String, Object>> listAllPicks();

    @Select("SELECT id, chat_name, sender, message_text, message_time, captured_at, category, stocks_json, created_at"
            + " FROM wechat_events WHERE (sender IS NULL OR sender = '' OR sender = '未识别发送人')"
            + " ORDER BY created_at DESC LIMIT 100")
    List<Map<String, Object>> listUnidentifiedSenders();

    @Select("SELECT id FROM wechat_events WHERE sender = #{sender} AND LEFT(message_text, 120) = #{prefix}"
            + " AND captured_at LIKE #{capturedLike} LIMIT 1")
    Map<String, Object> findDuplicate(@Param("sender") String sender,
                                      @Param("prefix") String prefix,
                                      @Param("capturedLike") String capturedLike);

    @Select("SELECT id FROM wechat_events WHERE sender = #{sender}")
    List<Map<String, Object>> listIdsBySender(@Param("sender") String sender);

    @Insert("INSERT INTO wechat_events (id, chat_name, sender, message_text, message_time, captured_at, stocks_json, created_at, category, urls_json)"
            + " VALUES (#{id}, #{chatName}, #{sender}, #{messageText}, #{messageTime}, #{capturedAt}, #{stocksJson}, #{createdAt}, #{category}, #{urlsJson})"
            + " ON DUPLICATE KEY UPDATE chat_name=VALUES(chat_name),"
            + " sender = CASE WHEN (wechat_events.sender IS NULL OR wechat_events.sender = '' OR wechat_events.sender = '未识别发送人')"
            + " AND VALUES(sender) != '' THEN VALUES(sender) ELSE wechat_events.sender END,"
            + " message_text=VALUES(message_text), message_time=VALUES(message_time), captured_at=VALUES(captured_at),"
            + " stocks_json=VALUES(stocks_json), category=VALUES(category), urls_json=VALUES(urls_json)")
    int upsertMonitoredEvent(Map<String, Object> data);

    @Insert("INSERT INTO wechat_events (id, chat_name, sender, message_text, message_time, captured_at, stocks_json, created_at, category)"
            + " VALUES (#{id}, #{chatName}, #{sender}, #{messageText}, #{messageTime}, #{capturedAt}, #{stocksJson}, #{createdAt}, #{category})")
    int insertManualEvent(Map<String, Object> data);

    @Update("UPDATE wechat_events SET sender = #{sender} WHERE id = #{id} AND (sender IS NULL OR sender = '' OR sender = '未识别发送人')")
    int updateSenderIfUnidentified(@Param("sender") String sender, @Param("id") String id);

    @Update("UPDATE wechat_events SET category = #{category}, is_manual = 1 WHERE id = #{id}")
    int updateCategoryManual(@Param("id") String id, @Param("category") String category);

    @Update("UPDATE wechat_events SET message_text = #{messageText}, stocks_json = #{stocksJson}, category = #{category},"
            + " sender = #{sender}, updated_at = #{updatedAt} WHERE id = #{id}")
    int updateTextAndStocks(Map<String, Object> data);

    @Update("UPDATE wechat_events SET stocks_json = #{stocksJson}, category = #{category}, updated_at = #{updatedAt} WHERE id = #{id}")
    int updateStocksAndCategory(Map<String, Object> data);

    @Update("UPDATE wechat_events SET stocks_json = #{stocksJson} WHERE id = #{id}")
    int updateStocksJson(@Param("id") String id, @Param("stocksJson") String stocksJson);

    @Delete("DELETE FROM wechat_events WHERE id = #{id}")
    int deleteById(@Param("id") String id);

    @Delete("DELETE FROM wechat_events WHERE sender = #{sender}")
    int deleteBySender(@Param("sender") String sender);

    @Delete("<script>DELETE FROM wechat_events WHERE id NOT IN"
            + " <foreach collection='ids' item='i' open='(' separator=',' close=')'>#{i}</foreach></script>")
    int deleteNotIn(@Param("ids") List<String> ids);

    @Delete("<script>DELETE FROM wechat_events WHERE id IN"
            + " <foreach collection='ids' item='i' open='(' separator=',' close=')'>#{i}</foreach></script>")
    int deleteByIds(@Param("ids") List<String> ids);

    @Delete("DELETE FROM wechat_events")
    int deleteAll();

    @Select("SELECT type, value FROM wechat_blacklist WHERE enabled = 1")
    List<Map<String, Object>> listEnabledBlacklist();

    /** 白名单汇总：按发送人取一段时间内消息（sender 精确匹配）。 */
    @Select("SELECT * FROM wechat_events WHERE sender = #{sender} AND created_at >= #{since} ORDER BY created_at DESC")
    List<Map<String, Object>> listBySenderSince(@Param("sender") String sender, @Param("since") long since);

    /** 白名单汇总：按启用白名单昵称批量取一段时间内消息。 */
    @Select("<script>SELECT * FROM wechat_events WHERE sender IN"
            + " <foreach collection='senders' item='s' open='(' separator=',' close=')'>#{s}</foreach>"
            + " AND created_at &gt;= #{since} ORDER BY created_at DESC</script>")
    List<Map<String, Object>> listBySendersSince(@Param("senders") List<String> senders,
                                                 @Param("since") long since);

    @Select("SELECT sender FROM ("
            + " SELECT sender, MAX(created_at) AS last_seen FROM wechat_events"
            + " WHERE sender IS NOT NULL AND sender != '' AND sender != '未识别发送人' GROUP BY sender"
            + " UNION ALL"
            + " SELECT sender, MAX(updated_at) AS last_seen FROM wechat_tracking"
            + " WHERE sender IS NOT NULL AND sender != '' AND sender != '未识别发送人' GROUP BY sender"
            + ") names ORDER BY last_seen DESC LIMIT 500")
    List<Map<String, Object>> listCanonicalSenderNames();
}
