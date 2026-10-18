package com.wangwenlin.stock.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.Map;

/**
 * life_persona（全局人物画像）读写。user_id 由拦截器注入。
 */
@Mapper
public interface LifePersonaMapper {

    /** 等价 readLifePersonaRow：SELECT * ORDER BY updated_at DESC LIMIT 1。 */
    Map<String, Object> selectLatest();

    /** 等价 AI / 用户首次建档的 INSERT（六维留空）。 */
    Integer insertPersona(@Param("id") String id,
                          @Param("source") String source,
                          @Param("createdAt") long createdAt,
                          @Param("updatedAt") long updatedAt);

    /**
     * 等价 PUT /api/life/persona 的动态 UPDATE：fields 只包含本次请求里出现过的维度列
     * （hard_skills / time_habits / traits / resources / values_pref / risks），
     * 另必带 id / source / updated_at。
     */
    Integer updatePersona(Map<String, Object> fields);
}
