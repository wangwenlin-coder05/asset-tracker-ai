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
 * wechat_tracking / wechat_tracking_daily 读写。SQL 与 Node 端逐条对齐，
 * user_id 由 TenantLineInnerInterceptor 注入。
 */
@Mapper
public interface WechatTrackingMapper {

    // ==================== wechat_tracking ====================

    @Select("<script>SELECT t.* FROM wechat_tracking t"
            + " INNER JOIN (SELECT sender, stock_code, MIN(created_at) AS min_created FROM wechat_tracking"
            + " <if test='sender != null and sender != \"\"'>WHERE sender = #{sender} AND deleted_at IS NULL</if>"
            + " <if test='sender == null or sender == \"\"'>WHERE deleted_at IS NULL</if>"
            + " GROUP BY sender, stock_code) g"
            + " ON t.sender = g.sender AND t.stock_code = g.stock_code AND t.created_at = g.min_created AND t.deleted_at IS NULL"
            + " ORDER BY t.pick_date DESC, t.created_at DESC LIMIT #{limit}</script>")
    List<Map<String, Object>> listDistinctPicks(@Param("sender") String sender, @Param("limit") int limit);

    @Select("SELECT * FROM wechat_tracking WHERE id = #{id} LIMIT 1")
    Map<String, Object> findById(@Param("id") String id);

    @Select("SELECT id, stock_code, stock_name FROM wechat_tracking WHERE locked = 0 ORDER BY updated_at ASC")
    List<Map<String, Object>> listUnlocked();

    @Select("SELECT id FROM wechat_tracking WHERE event_id = #{eventId}")
    List<Map<String, Object>> listIdsByEventId(@Param("eventId") String eventId);

    @Select("SELECT id, stock_code FROM wechat_tracking WHERE event_id = #{eventId}")
    List<Map<String, Object>> listByEventId(@Param("eventId") String eventId);

    @Select("SELECT id FROM wechat_tracking WHERE stock_code = #{stockCode}")
    List<Map<String, Object>> listIdsByStockCode(@Param("stockCode") String stockCode);

    @Select("SELECT COUNT(*) AS cnt FROM wechat_tracking WHERE stock_code = #{stockCode} AND event_id != #{eventId}")
    int countOtherRefs(@Param("stockCode") String stockCode, @Param("eventId") String eventId);

    @Select("SELECT id FROM wechat_tracking WHERE id = #{id}")
    List<Map<String, Object>> listIdsById(@Param("id") String id);

    @Select("SELECT id FROM wechat_tracking WHERE sender = #{sender}")
    List<Map<String, Object>> listIdsBySender(@Param("sender") String sender);

    @Select("SELECT id FROM wechat_tracking WHERE sender = #{sender} AND pick_date >= #{since} AND total_change_percent IS NOT NULL")
    List<Map<String, Object>> listIdsBySenderSince(@Param("sender") String sender, @Param("since") String since);

    @Select("SELECT id FROM wechat_tracking")
    List<Map<String, Object>> listAllIds();

    @Select("<script>SELECT id FROM wechat_tracking WHERE pick_date &gt;= #{startDate} AND pick_date &lt;= #{endDate}"
            + " AND deleted_at IS NULL"
            + " <if test='sender != null and sender != \"\"'>AND sender = #{sender}</if></script>")
    List<Map<String, Object>> listIdsByDateRange(@Param("startDate") String startDate,
                                                 @Param("endDate") String endDate,
                                                 @Param("sender") String sender);

    @Select("SELECT t.id, t.sender, t.stock_code, t.pick_date, t.pick_open_price, t.pick_change_percent,"
            + " t.d1_open_change_percent, t.total_change_percent, t.is_effective_profit, t.effective_profit_day_index, t.locked"
            + " FROM wechat_tracking t INNER JOIN wechat_events ev ON t.event_id = ev.id"
            + " WHERE t.pick_date >= #{since} AND t.deleted_at IS NULL"
            + " AND t.sender IS NOT NULL AND t.sender != '' AND t.sender != '未识别发送人' AND ev.category = 'stock_pick'")
    List<Map<String, Object>> listForInvestorAnalysis(@Param("since") String since);

    @Insert("INSERT IGNORE INTO wechat_tracking"
            + " (id, event_id, chat_name, sender, stock_code, stock_name, pick_date, pick_message, created_at, updated_at)"
            + " VALUES (#{id}, #{eventId}, #{chatName}, #{sender}, #{stockCode}, #{stockName}, #{pickDate}, #{pickMessage}, #{createdAt}, #{updatedAt})")
    int insertIgnore(Map<String, Object> data);

    @Insert("INSERT IGNORE INTO wechat_tracking"
            + " (id, event_id, chat_name, sender, stock_code, stock_name, pick_date, pick_message, created_at, updated_at)"
            + " VALUES (#{id}, #{eventId}, #{chatName}, #{sender}, #{stockCode}, #{stockName}, #{pickDate}, #{pickMessage}, #{createdAt}, #{updatedAt})"
            + " ON DUPLICATE KEY UPDATE updated_at = #{updatedAt}")
    int insertIgnoreTouch(Map<String, Object> data);

    @Insert("INSERT INTO wechat_tracking"
            + " (id, event_id, chat_name, sender, stock_code, stock_name, pick_date, pick_message, created_at, updated_at)"
            + " VALUES (#{id}, #{eventId}, #{chatName}, #{sender}, #{stockCode}, #{stockName}, #{pickDate}, #{pickMessage}, #{createdAt}, #{updatedAt})"
            + " ON DUPLICATE KEY UPDATE stock_name=VALUES(stock_name), updated_at=VALUES(updated_at), sender=VALUES(sender)")
    int insertOrUpdateForText(Map<String, Object> data);

    @Update("UPDATE wechat_tracking SET deleted_at = #{deletedAt} WHERE id = #{id}")
    int softDelete(@Param("id") String id, @Param("deletedAt") long deletedAt);

    @Update("<script>UPDATE wechat_tracking SET deleted_at = #{deletedAt} WHERE id IN"
            + " <foreach collection='ids' item='i' open='(' separator=',' close=')'>#{i}</foreach></script>")
    int softDeleteByIds(@Param("ids") List<String> ids, @Param("deletedAt") long deletedAt);

    @Update("UPDATE wechat_tracking SET entry_type = #{entryType}, updated_at = #{updatedAt} WHERE id = #{id}")
    int updateEntryType(@Param("id") String id, @Param("entryType") int entryType, @Param("updatedAt") long updatedAt);

    @Update("UPDATE wechat_tracking SET locked = #{locked}, is_effective_profit = #{isEffectiveProfit}, updated_at = #{updatedAt} WHERE id = #{id}")
    int updateLocked(@Param("id") String id, @Param("locked") int locked,
                     @Param("isEffectiveProfit") int isEffectiveProfit, @Param("updatedAt") long updatedAt);

    @Update("<script>UPDATE wechat_tracking SET pick_date = #{pickDate} WHERE id IN"
            + " <foreach collection='ids' item='i' open='(' separator=',' close=')'>#{i}</foreach></script>")
    int updatePickDate(@Param("ids") List<String> ids, @Param("pickDate") String pickDate);

    @Update("<script>UPDATE wechat_tracking SET delisted = #{delisted} WHERE id IN"
            + " <foreach collection='ids' item='i' open='(' separator=',' close=')'>#{i}</foreach></script>")
    int updateDelisted(@Param("ids") List<String> ids, @Param("delisted") int delisted);

    @Update("<script>UPDATE wechat_tracking SET"
            + " <trim suffixOverrides=','>"
            + " <if test='pickDate != null'>pick_date = #{pickDate},</if>"
            + " <if test='delisted != null'>delisted = #{delisted},</if>"
            + " </trim>"
            + " WHERE id IN"
            + " <foreach collection='ids' item='i' open='(' separator=',' close=')'>#{i}</foreach></script>")
    int batchUpdate(@Param("ids") List<String> ids, @Param("pickDate") String pickDate,
                    @Param("delisted") Integer delisted);

    @Update("UPDATE wechat_tracking SET pick_open_price = #{pickOpenPrice}, pick_close_price = #{pickClosePrice},"
            + " pick_change_percent = #{pickChangePercent}, latest_date = #{latestDate}, latest_close_price = #{latestClosePrice},"
            + " total_change_percent = #{totalChangePercent}, total_change_amount = #{totalChangeAmount},"
            + " d1_open_change_percent = #{d1OpenChangePercent}, is_effective_profit = #{isEffectiveProfit},"
            + " effective_profit_day_index = #{effectiveProfitDayIndex}, effective_profit_percent = #{effectiveProfitPercent},"
            + " updated_at = #{updatedAt} WHERE id = #{id}")
    int updateQuoteFields(Map<String, Object> data);

    @Update("UPDATE wechat_tracking SET latest_close_price = #{price}, total_change_percent = #{totalChangePercent},"
            + " total_change_amount = #{totalChangeAmount}, updated_at = #{updatedAt} WHERE id = #{id}")
    int updateRealtimeQuote(Map<String, Object> data);

    @Delete("DELETE FROM wechat_tracking WHERE id = #{id}")
    int deleteById(@Param("id") String id);

    @Delete("DELETE FROM wechat_tracking WHERE event_id = #{eventId}")
    int deleteByEventId(@Param("eventId") String eventId);

    @Delete("DELETE FROM wechat_tracking WHERE stock_code = #{stockCode}")
    int deleteByStockCode(@Param("stockCode") String stockCode);

    @Delete("DELETE FROM wechat_tracking WHERE sender = #{sender}")
    int deleteBySender(@Param("sender") String sender);

    @Select("<script>SELECT t.id FROM wechat_tracking t LEFT JOIN wechat_events e ON t.event_id = e.id"
            + " WHERE e.id IS NULL OR t.event_id NOT IN"
            + " <foreach collection='ids' item='i' open='(' separator=',' close=')'>#{i}</foreach></script>")
    List<Map<String, Object>> listOrphanTrackingIds(@Param("ids") List<String> ids);

    @Delete("<script>DELETE FROM wechat_tracking WHERE event_id NOT IN"
            + " <foreach collection='ids' item='i' open='(' separator=',' close=')'>#{i}</foreach></script>")
    int deleteTrackingNotIn(@Param("ids") List<String> ids);

    @Select("<script>SELECT id FROM wechat_tracking WHERE event_id IN"
            + " <foreach collection='ids' item='i' open='(' separator=',' close=')'>#{i}</foreach></script>")
    List<Map<String, Object>> listIdsByEventIds(@Param("ids") List<String> ids);

    @Delete("<script>DELETE FROM wechat_tracking WHERE event_id IN"
            + " <foreach collection='ids' item='i' open='(' separator=',' close=')'>#{i}</foreach></script>")
    int deleteByEventIds(@Param("ids") List<String> ids);

    @Delete("DELETE FROM wechat_tracking")
    int deleteAll();

    // ==================== wechat_tracking_daily ====================

    @Select("SELECT * FROM wechat_tracking_daily WHERE tracking_id = #{trackingId} AND day_index <= #{dayIndex} ORDER BY trade_date ASC")
    List<Map<String, Object>> listDailyUpTo(@Param("trackingId") String trackingId, @Param("dayIndex") int dayIndex);

    @Select("SELECT * FROM wechat_tracking_daily WHERE tracking_id = #{trackingId} ORDER BY trade_date ASC")
    List<Map<String, Object>> listDaily(@Param("trackingId") String trackingId);

    @Select("SELECT day_index, total_change_percent, high_price FROM wechat_tracking_daily WHERE tracking_id = #{trackingId}"
            + " AND day_index >= #{dayIndex} ORDER BY day_index ASC")
    List<Map<String, Object>> listDailyFromDay(@Param("trackingId") String trackingId, @Param("dayIndex") int dayIndex);

    @Select("<script>SELECT tracking_id, day_index, open_price, close_price, high_price, total_change_percent"
            + " FROM wechat_tracking_daily WHERE tracking_id IN"
            + " <foreach collection='ids' item='i' open='(' separator=',' close=')'>#{i}</foreach>"
            + " ORDER BY tracking_id, day_index</script>")
    List<Map<String, Object>> listDailyByTrackingIds(@Param("ids") List<String> ids);

    @Select("<script>SELECT tracking_id, day_index, total_change_amount FROM wechat_tracking_daily WHERE tracking_id IN"
            + " <foreach collection='ids' item='i' open='(' separator=',' close=')'>#{i}</foreach>"
            + " AND total_change_amount >= #{target} ORDER BY tracking_id, day_index ASC</script>")
    List<Map<String, Object>> listDailyHitAmount(@Param("ids") List<String> ids, @Param("target") double target);

    @Insert("INSERT INTO wechat_tracking_daily"
            + " (id, tracking_id, trade_date, day_index, open_price, close_price, high_price, low_price,"
            + " day_change_percent, total_change_percent, total_change_amount, updated_at)"
            + " VALUES (#{id}, #{trackingId}, #{tradeDate}, #{dayIndex}, #{openPrice}, #{closePrice}, #{highPrice}, #{lowPrice},"
            + " #{dayChangePercent}, #{totalChangePercent}, #{totalChangeAmount}, #{updatedAt})"
            + " ON DUPLICATE KEY UPDATE day_index=VALUES(day_index), open_price=VALUES(open_price), close_price=VALUES(close_price),"
            + " high_price=VALUES(high_price), low_price=VALUES(low_price), day_change_percent=VALUES(day_change_percent),"
            + " total_change_percent=VALUES(total_change_percent), total_change_amount=VALUES(total_change_amount),"
            + " updated_at=VALUES(updated_at)")
    int upsertDaily(Map<String, Object> data);

    @Delete("DELETE FROM wechat_tracking_daily WHERE tracking_id = #{trackingId}")
    int deleteDailyByTrackingId(@Param("trackingId") String trackingId);

    @Delete("<script>DELETE FROM wechat_tracking_daily WHERE tracking_id IN"
            + " <foreach collection='ids' item='i' open='(' separator=',' close=')'>#{i}</foreach></script>")
    int deleteDailyByTrackingIds(@Param("ids") List<String> ids);

    @Delete("DELETE FROM wechat_tracking_daily")
    int deleteAllDaily();
}
