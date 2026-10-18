package com.wangwenlin.stock.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.Map;

/**
 * life_persona_derived（动态人物画像）读写。user_id 由拦截器注入。
 */
@Mapper
public interface LifePersonaDerivedMapper {

    /** 等价 readLifeDerivedRow：SELECT * ORDER BY updated_at DESC LIMIT 1。 */
    Map<String, Object> selectLatest();

    /** 等价 deriveLifePersona 的 UPDATE（同一天覆盖已有画像）。 */
    Integer updateDerived(@Param("id") String id,
                          @Param("state") String state,
                          @Param("abilities") String abilities,
                          @Param("habits") String habits,
                          @Param("traits") String traits,
                          @Param("resources") String resources,
                          @Param("future") String future,
                          @Param("advantage") String advantage,
                          @Param("progressJson") String progressJson,
                          @Param("signature") String signature,
                          @Param("updatedAt") long updatedAt);

    /** 等价 deriveLifePersona 的 INSERT（首次生成画像）。 */
    Integer insertDerived(@Param("id") String id,
                          @Param("state") String state,
                          @Param("abilities") String abilities,
                          @Param("habits") String habits,
                          @Param("traits") String traits,
                          @Param("resources") String resources,
                          @Param("future") String future,
                          @Param("advantage") String advantage,
                          @Param("progressJson") String progressJson,
                          @Param("signature") String signature,
                          @Param("updatedAt") long updatedAt);
}
