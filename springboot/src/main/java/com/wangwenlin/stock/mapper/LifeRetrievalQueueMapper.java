package com.wangwenlin.stock.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * life_retrieval_queue（待审批检索队列）读写。user_id 由拦截器注入。
 */
@Mapper
public interface LifeRetrievalQueueMapper {

    /** 等价 queueLifeRetrieval 的整行插入。 */
    Integer insertQueue(Map<String, Object> item);

    /** 等价 SELECT * FROM life_retrieval_queue ORDER BY created_at DESC。 */
    List<Map<String, Object>> selectAll();

    /** 按状态列出队列（后续审批批次使用）。 */
    List<Map<String, Object>> listByStatus(@Param("status") String status);

    /** 等价 GET /api/life/retrieval/queue：SELECT * ORDER BY created_at DESC LIMIT N。 */
    List<Map<String, Object>> selectRecent(@Param("limit") int limit);

    /** 等价 collectLifeRetrievalBatch 取待归集条目：status='pending' 且尚未绑定批次。 */
    List<Map<String, Object>> listPendingUnbatched();

    /** 等价 collectLifeRetrievalBatch：把选中条目绑到新批次。 */
    Integer attachBatch(@Param("ids") List<String> ids,
                        @Param("batchId") String batchId,
                        @Param("updatedAt") long updatedAt);

    /** 等价 GET /api/life/retrieval/batches：只取 id 与 batch_id 的配对。 */
    List<Map<String, Object>> selectBatchPairs();

    /** 等价决定入口：按批次 id 取该批 pending 条目。 */
    List<Map<String, Object>> listPendingByBatch(@Param("batchId") String batchId);

    /** 等价「全部驳回」：整批 pending → rejected。 */
    Integer rejectPendingByBatch(@Param("batchId") String batchId,
                                 @Param("updatedAt") long updatedAt);

    /** 等价 partial 分支：未勾选条目脱离本批次（batch_id 置空）。 */
    Integer detachFromBatch(@Param("ids") List<String> ids,
                            @Param("updatedAt") long updatedAt);

    /** 等价 executeLifeRetrieval 命中/未命中缓存后写回结果。 */
    Integer markDone(@Param("id") String id,
                     @Param("result") String result,
                     @Param("fromCache") int fromCache,
                     @Param("updatedAt") long updatedAt);

    /** 等价 executeLifeRetrieval 失败：status='failed' 并记录错误文案。 */
    Integer markFailed(@Param("id") String id,
                       @Param("result") String result,
                       @Param("updatedAt") long updatedAt);

    /** 等价 GET /api/life/retrieval/bill：SELECT COUNT(*) AS n WHERE status = ?。 */
    Map<String, Object> countByStatus(@Param("status") String status);
}
