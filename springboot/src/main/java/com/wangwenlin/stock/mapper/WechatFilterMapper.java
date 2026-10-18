package com.wangwenlin.stock.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * wechat_blacklist / wechat_whitelist 读写。SQL 与 server.js 3468-3567 逐条对齐，
 * user_id 由 TenantLineInnerInterceptor 注入。
 * <p>
 * 语句放在 XML 里并统一 {@code resultType="java.util.LinkedHashMap"}，
 * 让列标签按列序保序，与 Node 端 mysql2 返回的裸行逐字节一致。
 */
@Mapper
public interface WechatFilterMapper {

    // ==================== wechat_blacklist ====================

    List<Map<String, Object>> listBlacklist();

    List<Map<String, Object>> findBlacklistByTypeValue(@Param("type") String type, @Param("value") String value);

    int insertBlacklist(Map<String, Object> data);

    int deleteBlacklist(@Param("id") String id);

    int updateBlacklistNote(@Param("id") String id, @Param("note") String note);

    int updateBlacklistEnabled(@Param("id") String id, @Param("enabled") int enabled);

    List<Map<String, Object>> listSessionSkipRules();

    // ==================== wechat_whitelist ====================

    List<Map<String, Object>> listWhitelist();

    List<Map<String, Object>> findWhitelistByNickname(@Param("nickname") String nickname);

    List<Map<String, Object>> listEnabledWhitelistNicknames();

    int insertWhitelist(Map<String, Object> data);

    int deleteWhitelist(@Param("id") String id);

    int updateWhitelistNote(@Param("id") String id, @Param("note") String note);

    int updateWhitelistEnabled(@Param("id") String id, @Param("enabled") int enabled);
}
