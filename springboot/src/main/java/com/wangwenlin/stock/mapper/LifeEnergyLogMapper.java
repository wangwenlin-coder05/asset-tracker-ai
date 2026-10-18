package com.wangwenlin.stock.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * life_energy_logs 读写。user_id 由拦截器注入。
 */
@Mapper
public interface LifeEnergyLogMapper {

    /** 等价 lifeStructuredContext：SELECT * ORDER BY log_date DESC LIMIT 1。 */
    Map<String, Object> selectLatest();

    /** 等价 refreshLifeDerived：按 log_date 取一条。 */
    Map<String, Object> selectByDate(@Param("logDate") String logDate);

    /** 等价 refreshLifeDerived：只更新计划总时长与超负荷标记，保留用户填写的上限与身体状态。 */
    Integer updatePlanned(@Param("id") String id,
                          @Param("plannedMinutes") int plannedMinutes,
                          @Param("overload") int overload);

    /** 等价 refreshLifeDerived：当日首次精力负荷记录。 */
    Integer insertEnergy(@Param("id") String id,
                         @Param("logDate") String logDate,
                         @Param("plannedMinutes") double plannedMinutes,
                         @Param("capacityMinutes") double capacityMinutes,
                         @Param("overload") int overload,
                         @Param("distractions") String distractions,
                         @Param("sleepHours") double sleepHours,
                         @Param("health") String health,
                         @Param("note") String note,
                         @Param("createdAt") long createdAt);

    /** 等价 server.js 9799：同日覆盖已有精力负荷的整行更新。 */
    Integer updateEnergyFull(@Param("id") String id,
                             @Param("plannedMinutes") double plannedMinutes,
                             @Param("capacityMinutes") double capacityMinutes,
                             @Param("overload") int overload,
                             @Param("distractions") String distractions,
                             @Param("sleepHours") double sleepHours,
                             @Param("health") String health,
                             @Param("note") String note);

    /** 按主键删除。 */
    Integer deleteById(@Param("id") String id);

    /** 列表接口按日期倒序取记录。 */
    List<Map<String, Object>> selectRecent(@Param("limit") int limit);
}
