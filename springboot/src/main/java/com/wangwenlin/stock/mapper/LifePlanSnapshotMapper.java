package com.wangwenlin.stock.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * life_plan_snapshots 读写。user_id 由拦截器注入。
 */
@Mapper
public interface LifePlanSnapshotMapper {

    /** 等价 lifeStructuredContext：SELECT * ORDER BY created_at DESC LIMIT 1。 */
    Map<String, Object> selectLatest();

    /** 等价 refreshLifeDerived：按 snap_date 取一条。 */
    Map<String, Object> selectByDate(@Param("snapDate") String snapDate);

    /** 等价 refreshLifeDerived：同日覆盖已有快照。 */
    Integer updateSnapshot(@Param("id") String id,
                           @Param("progress") int progress,
                           @Param("payload") String payload,
                           @Param("diffNote") String diffNote);

    /** 等价 refreshLifeDerived：同日首次快照。 */
    Integer insertSnapshot(@Param("id") String id,
                           @Param("snapDate") String snapDate,
                           @Param("progress") int progress,
                           @Param("payload") String payload,
                           @Param("diffNote") String diffNote,
                           @Param("createdAt") long createdAt);

    /** 按主键删除。 */
    Integer deleteById(@Param("id") String id);

    /** 列表接口按时间倒序取快照。 */
    List<Map<String, Object>> selectRecent(@Param("limit") int limit);

    /** 等价 server.js 9724 / 9736：按主键取一条快照。 */
    Map<String, Object> selectById(@Param("id") String id);
}
