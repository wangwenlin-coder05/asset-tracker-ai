package com.wangwenlin.stock.mapper;

import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * ai_settings 表访问。SQL 内不写 user_id —— 由 TenantLineInnerInterceptor 自动注入。
 */
public interface AiSettingsMapper {

    /** 等价 Node 端 {@code SELECT setting_key, setting_value FROM ai_settings}。 */
    List<Map<String, Object>> listAll();

    /** 等价 Node 端 {@code SELECT setting_value FROM ai_settings WHERE setting_key = ? LIMIT 1}。 */
    String valueOfKey(@Param("key") String key);

    /** 等价 Node 端 {@code INSERT ... ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = ?}。 */
    Integer upsert(@Param("key") String key,
                   @Param("value") String value,
                   @Param("updatedAt") long updatedAt);
}
