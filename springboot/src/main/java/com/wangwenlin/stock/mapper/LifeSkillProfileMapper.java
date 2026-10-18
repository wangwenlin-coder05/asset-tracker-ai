package com.wangwenlin.stock.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * life_skill_profile 读写。user_id 由拦截器注入。
 */
@Mapper
public interface LifeSkillProfileMapper {

    /** 等价 lifeStructuredContext：SELECT * ORDER BY sort_order ASC。 */
    List<Map<String, Object>> selectAll();

    /** 列表接口：SELECT * ORDER BY sort_order ASC, created_at ASC。 */
    List<Map<String, Object>> selectAllWithCreated();

    /** 等价「同名技能就地更新」的判重查询。 */
    Map<String, Object> selectByName(@Param("name") String name);

    /** 整行插入。 */
    Integer insertSkill(Map<String, Object> skill);

    /** 按主键删除。 */
    Integer deleteById(@Param("id") String id);

    /** 等价 server.js 9859 的 PUT 动态更新。data 仅含本次要改的 snake_case 列 + id + updated_at。 */
    Integer updateSkillFields(Map<String, Object> data);
}
