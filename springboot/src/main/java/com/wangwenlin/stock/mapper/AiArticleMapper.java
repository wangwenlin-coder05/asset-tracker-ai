package com.wangwenlin.stock.mapper;

import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * ai_articles 表访问 —— 对齐 Node 端 server.js 中 AI 创作工作台的文章 CRUD。
 * SQL 内不写 user_id —— 由 TenantLineInnerInterceptor 自动注入。
 */
public interface AiArticleMapper {

    /** 列表查询。params: category / status / qLike / orderBy($) / pageSize / offset。 */
    List<Map<String, Object>> list(Map<String, Object> params);

    /** 列表总数。params: category / status / qLike。 */
    long count(Map<String, Object> params);

    /** 全部分类去重（前端筛选下拉）。 */
    List<String> distinctCategories();

    Map<String, Object> findById(@Param("id") String id);

    Integer insert(Map<String, Object> data);

    /** 动态部分更新，data 中必须包含 id 与 updatedAt。 */
    Integer update(Map<String, Object> data);

    Integer deleteById(@Param("id") String id);
}
