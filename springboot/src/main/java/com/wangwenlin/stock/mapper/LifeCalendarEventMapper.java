package com.wangwenlin.stock.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * life_calendar_events 读写。user_id 由拦截器注入。
 */
@Mapper
public interface LifeCalendarEventMapper {

    /** 等价 lifeAlerts：SELECT * ORDER BY event_date ASC。 */
    List<Map<String, Object>> selectAllByDate();

    /** 等价 lifeStructuredContext：SELECT * ORDER BY event_date ASC LIMIT N。 */
    List<Map<String, Object>> selectTopByDate(@Param("limit") int limit);

    /** 等价「同 title 就地更新」的判重查询。 */
    Map<String, Object> selectByTitle(@Param("title") String title);

    /** 整行插入。 */
    Integer insertEvent(Map<String, Object> event);

    /** 按主键删除。 */
    Integer deleteById(@Param("id") String id);

    /** 等价 server.js 10187：DELETE 前取 title（对齐 rows[0]?.title || id）。 */
    Map<String, Object> selectTitleById(@Param("id") String id);

    /** 等价 server.js 10174 的 PUT 动态更新。data 仅含本次要改的 snake_case 列 + id + updated_at。 */
    Integer updateEventFields(Map<String, Object> data);
}
