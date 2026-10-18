package com.wangwenlin.stock.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * life_daily_tasks 读写。user_id 由拦截器注入。
 */
@Mapper
public interface LifeDailyTaskMapper {

    /** 等价 listLifeTasks：按 date / from / to 三档过滤，ORDER BY task_date ASC, sort_order ASC, created_at ASC。 */
    List<Map<String, Object>> selectTasks(@Param("date") String date,
                                          @Param("from") String from,
                                          @Param("to") String to);

    /** 按主键查一条。 */
    Map<String, Object> selectById(@Param("id") String id);

    /** 整行插入。 */
    Integer insertTask(Map<String, Object> task);

    /** 按主键删除。 */
    Integer deleteById(@Param("id") String id);

    // ==================== /api/life/tasks 域内 CRUD 专用语句 ====================

    /** 等价 server.js 9681：DELETE 前取 title（对齐 rows[0]?.title || id）。 */
    Map<String, Object> selectTitleById(@Param("id") String id);

    /** 等价 server.js 9652：delay 顺延，取 task_date >= base 且 id <> 本条的记录。 */
    List<Map<String, Object>> selectLaterTasks(@Param("base") String base, @Param("id") String id);

    /** 等价 server.js 9421 的 PUT 动态更新。data 仅含本次要改的 snake_case 列 + id + updated_at，列是否出现由 containsKey 决定。 */
    Integer updateTaskFields(Map<String, Object> data);

    /** 等价 server.js 9654：顺延单条 task_date。 */
    Integer updateTaskDate(@Param("id") String id,
                           @Param("taskDate") String taskDate,
                           @Param("updatedAt") long updatedAt);

    /** 等价 server.js 9656：delay 同时改 status 与 task_date。 */
    Integer updateStatusAndDate(@Param("id") String id,
                                @Param("status") String status,
                                @Param("taskDate") String taskDate,
                                @Param("updatedAt") long updatedAt);

    /** 等价 server.js 9659：仅改 status。 */
    Integer updateStatus(@Param("id") String id,
                         @Param("status") String status,
                         @Param("updatedAt") long updatedAt);

    /** 等价 server.js 8970：思维导图里改节点状态时，按 node_id 双向同步每日任务状态。 */
    Integer updateStatusByNodeId(@Param("status") String status,
                                 @Param("updatedAt") long updatedAt,
                                 @Param("nodeId") String nodeId);
}
