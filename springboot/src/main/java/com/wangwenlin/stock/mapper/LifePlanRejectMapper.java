package com.wangwenlin.stock.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * life_plan_rejects（「不要了」清单）读写。主键为 (user_id, title)，user_id 由拦截器注入，
 * INSERT 列清单里绝不能出现 user_id。user_id 由拦截器注入。
 */
@Mapper
public interface LifePlanRejectMapper {

    /** 等价 SELECT title, kind, created_at FROM life_plan_rejects ORDER BY created_at DESC。 */
    List<Map<String, Object>> selectAll();

    /** 等价 SELECT title FROM life_plan_rejects（判重 / 过滤用）。 */
    List<Map<String, Object>> listTitles();

    /** 等价 INSERT ... ON DUPLICATE KEY UPDATE created_at = VALUES(created_at)。 */
    Integer upsertReject(@Param("title") String title,
                         @Param("kind") String kind,
                         @Param("createdAt") long createdAt);

    /** 按标题删除。 */
    Integer deleteByTitle(@Param("title") String title);

    /** 按标题批量删除。 */
    Integer deleteByTitles(@Param("titles") List<String> titles);

    /** 等价 server.js 9032 / 9077 的整表清空。 */
    Integer deleteAll();
}
