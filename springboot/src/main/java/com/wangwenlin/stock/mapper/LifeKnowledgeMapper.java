package com.wangwenlin.stock.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * life_knowledge 读写。user_id 由拦截器注入。
 */
@Mapper
public interface LifeKnowledgeMapper {

    /** 等价 lifeStructuredContext：SELECT * ORDER BY created_at DESC LIMIT N。 */
    List<Map<String, Object>> selectRecent(@Param("limit") int limit);

    /** 按主键查一条。 */
    Map<String, Object> selectById(@Param("id") String id);

    /** 等价「同 topic 就地更新」的判重查询。 */
    Map<String, Object> selectByTopic(@Param("topic") String topic);

    /** 整行插入。 */
    Integer insertKnowledge(Map<String, Object> knowledge);

    /** 间隔重复：更新复习阶段与下次复习日期。 */
    Integer updateReviewStage(@Param("id") String id,
                              @Param("reviewStage") double reviewStage,
                              @Param("nextReviewDate") String nextReviewDate,
                              @Param("updatedAt") long updatedAt);

    /** 按主键删除。 */
    Integer deleteById(@Param("id") String id);

    /** 等价 server.js 10101：DELETE 前取 topic（对齐 rows[0]?.topic || id）。 */
    Map<String, Object> selectTopicById(@Param("id") String id);

    /** 等价 server.js 10088 的 PUT 动态更新。data 仅含本次要改的 snake_case 列 + id + updated_at。 */
    Integer updateKnowledgeFields(Map<String, Object> data);
}
