package com.wangwenlin.stock.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.Map;

/**
 * life_retrieval_cache（检索结果缓存）读写。user_id 由拦截器注入。
 */
@Mapper
public interface LifeRetrievalCacheMapper {

    /** 等价 lifeCacheLookup：SELECT result FROM life_retrieval_cache WHERE query_key = ? LIMIT 1。 */
    Map<String, Object> selectResult(@Param("queryKey") String queryKey);

    /** 等价 lifeCacheLookup 的命中计数：UPDATE ... SET hits = hits + 1, updated_at = ? WHERE query_key = ?。 */
    Integer bumpHit(@Param("queryKey") String queryKey,
                    @Param("updatedAt") long updatedAt);

    /** 等价 lifeCacheStore：INSERT ... ON DUPLICATE KEY UPDATE。 */
    Integer upsert(@Param("queryKey") String queryKey,
                   @Param("query") String query,
                   @Param("result") String result,
                   @Param("createdAt") long createdAt,
                   @Param("updatedAt") long updatedAt);

    /** 按 cache_key 删除。 */
    Integer deleteByQueryKey(@Param("queryKey") String queryKey);

    /** 等价 GET /api/life/retrieval/bill：缓存条数与命中次数合计。 */
    Map<String, Object> selectStats();
}
