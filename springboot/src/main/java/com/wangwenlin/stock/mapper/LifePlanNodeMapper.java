package com.wangwenlin.stock.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * life_plan_nodes 读写。SQL 与 server.js 逐条对齐，user_id 由 TenantLineInnerInterceptor 注入，
 * 语句里绝不出现 user_id。SELECT 一律返回 snake_case 键的 Map。
 */
@Mapper
public interface LifePlanNodeMapper {

    /** 等价 listLifeNodes：SELECT * ORDER BY sort_order ASC, created_at ASC。 */
    List<Map<String, Object>> selectAll();

    /** 按主键查一条。 */
    Map<String, Object> selectById(@Param("id") String id);

    /** 等价 ensureLifeSelfNode：取最早的 self 节点。 */
    Map<String, Object> selectFirstSelf();

    /** 等价 ensureLifeSelfNode：取出除 keep 以外的重复 self 节点 id。 */
    List<Map<String, Object>> listSelfIdsExcept(@Param("keep") String keep);

    /** 等价 fillLifeContainerDates：SELECT id, parent_id, kind, title, series, horizon, start_date。 */
    List<Map<String, Object>> listNodeDateFields();

    /** 等价 enforceStoredExamAnchors：SELECT id, title, horizon WHERE horizon <> ''。 */
    List<Map<String, Object>> listHorizonNonEmpty();

    /** 等价 ensureLifeSelfNode 的 self 兜底 INSERT。 */
    Integer insertNode(Map<String, Object> node);

    /** 等价 ensureLifeSelfNode：把重复 self 的子节点改挂回来。 */
    Integer updateParentId(@Param("newParentId") String newParentId,
                           @Param("oldParentId") String oldParentId);

    /** 等价 fillLifeContainerDates 步骤①：只清 horizon。 */
    Integer updateHorizon(@Param("horizon") String horizon,
                          @Param("updatedAt") long updatedAt,
                          @Param("id") String id);

    /** 等价 fillLifeContainerDates 步骤③：按需写 horizon / start_date，同时写 time_group 与 updated_at。 */
    Integer updateNodeDates(@Param("id") String id,
                            @Param("setHorizon") boolean setHorizon,
                            @Param("horizon") String horizon,
                            @Param("setStart") boolean setStart,
                            @Param("startDate") String startDate,
                            @Param("timeGroup") String timeGroup,
                            @Param("updatedAt") long updatedAt);

    /** 等价 fillLifeContainerDates 步骤④ / enforceStoredExamAnchors：horizon + time_group + updated_at。 */
    Integer updateHorizonTimeGroup(@Param("horizon") String horizon,
                                   @Param("timeGroup") String timeGroup,
                                   @Param("updatedAt") long updatedAt,
                                   @Param("id") String id);

    /** 按主键删除。 */
    Integer deleteById(@Param("id") String id);

    // ==================== /api/life 规划节点 CRUD 与快照回退共用语句 ====================

    /**
     * 等价 server.js 8903 手动新增节点的 INSERT（20 列）。
     * data 的键为 snake_case 列名：parent_id/kind/domain/title/detail/risk/status/horizon/
     * start_date/weight/content_type/content_body/progress_note/reference_ids/is_shared/source/
     * sort_order/created_at/updated_at。
     */
    Integer insertNodeManual(Map<String, Object> data);

    /**
     * 等价 server.js 9747 快照回退的 INSERT（21 列，与手动新增的列集合不同）。
     * data 的键为 snake_case 列名：parent_id/kind/domain/title/detail/risk/status/horizon/weight/
     * source/sort_order/time_group/deps/step_no/priority/series/content_type/content_body/
     * created_at/updated_at。
     */
    Integer insertNodeFromSnapshot(Map<String, Object> data);

    /**
     * 等价 server.js 8924 的 PUT 动态更新。data 仅包含本次要改的 snake_case 列 + id + updated_at，
     * 列是否出现由 containsKey 决定（对齐 JS 的 `body.xxx !== undefined`）。
     */
    Integer updateNodeFields(Map<String, Object> data);

    /** 等价 server.js 9744 / 9025：DELETE FROM life_plan_nodes WHERE kind <> 'self'。 */
    Integer deleteNonSelf();

    /** 等价 server.js 9085 的整表清空（含 self）。 */
    Integer deleteAll();
}
