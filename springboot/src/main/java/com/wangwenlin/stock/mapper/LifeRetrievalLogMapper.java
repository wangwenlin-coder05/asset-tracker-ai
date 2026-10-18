package com.wangwenlin.stock.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * life_retrieval_logs（检索流水）读写。user_id 由拦截器注入。
 */
@Mapper
public interface LifeRetrievalLogMapper {

    /** 等价 logLifeRetrieval：INSERT INTO life_retrieval_logs (...)。 */
    Integer insertLog(@Param("id") String id,
                      @Param("batchId") String batchId,
                      @Param("action") String action,
                      @Param("detail") String detail,
                      @Param("cost") double cost,
                      @Param("createdAt") long createdAt);

    /** 等价 SELECT * FROM life_retrieval_logs ORDER BY created_at DESC LIMIT N。 */
    List<Map<String, Object>> selectRecent(@Param("limit") int limit);
}
