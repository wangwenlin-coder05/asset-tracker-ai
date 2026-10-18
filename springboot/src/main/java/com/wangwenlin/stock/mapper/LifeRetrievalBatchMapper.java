package com.wangwenlin.stock.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * life_retrieval_batches（检索归集批次）读写。user_id 由拦截器注入。
 */
@Mapper
public interface LifeRetrievalBatchMapper {

    /** 等价 SELECT COUNT(*) AS n FROM life_retrieval_batches。 */
    Map<String, Object> countAll();

    /** 等价 collectLifeRetrievalBatch 的 INSERT（含 actual_cost=0 / decided_at=0）。 */
    Integer insertBatch(@Param("id") String id,
                        @Param("batchNo") String batchNo,
                        @Param("taskCount") int taskCount,
                        @Param("estCost") double estCost,
                        @Param("actualCost") double actualCost,
                        @Param("status") String status,
                        @Param("createdAt") long createdAt,
                        @Param("decidedAt") long decidedAt);

    /** 等价 SELECT * WHERE id = ? LIMIT 1。 */
    Map<String, Object> selectById(@Param("id") String id);

    /** 等价 SELECT * ORDER BY created_at DESC LIMIT N。 */
    List<Map<String, Object>> selectRecent(@Param("limit") int limit);

    /** 等价审批后更新批次状态与实付费用。 */
    Integer updateStatus(@Param("id") String id,
                         @Param("status") String status,
                         @Param("actualCost") double actualCost,
                         @Param("decidedAt") long decidedAt);

    /** 等价 GET /api/life/retrieval/bill：已结算批次的条数与实付合计。 */
    Map<String, Object> billingTotals();
}
