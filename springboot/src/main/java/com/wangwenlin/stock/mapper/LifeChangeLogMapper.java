package com.wangwenlin.stock.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * life_change_logs 读写。user_id 由拦截器注入。
 */
@Mapper
public interface LifeChangeLogMapper {

    /** 按时间倒序取最近 N 条。 */
    List<Map<String, Object>> selectRecent(@Param("limit") int limit);

    /** 等价 logLifePanelChange 的变更日志写入。 */
    Integer insertChange(@Param("id") String id,
                         @Param("module") String module,
                         @Param("content") String content,
                         @Param("reason") String reason,
                         @Param("affected") String affected,
                         @Param("snapshotId") String snapshotId,
                         @Param("createdAt") long createdAt);
}
