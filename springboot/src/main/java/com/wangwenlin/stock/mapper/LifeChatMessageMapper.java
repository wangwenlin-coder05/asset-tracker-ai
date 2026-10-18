package com.wangwenlin.stock.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * life_chat_messages 读写。user_id 由拦截器注入。
 */
@Mapper
public interface LifeChatMessageMapper {

    /** 等价 logLifePanelChange 的系统消息写入。 */
    Integer insertMessage(@Param("id") String id,
                          @Param("role") String role,
                          @Param("content") String content,
                          @Param("createdAt") long createdAt);

    /** 等价 buildLifeUserPrompt / recentLifeTranscript：按时间倒序取最近 N 条。 */
    List<Map<String, Object>> listRecent(@Param("limit") int limit);

    /** 等价 server.js 8255：SELECT id, role, content, created_at ORDER BY created_at ASC LIMIT 500。 */
    List<Map<String, Object>> listAsc(@Param("limit") int limit);

    /** 等价 server.js 9065：DELETE FROM life_chat_messages。 */
    Integer deleteAll();
}
