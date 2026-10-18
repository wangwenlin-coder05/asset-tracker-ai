package com.wangwenlin.stock.mapper;

import org.apache.ibatis.annotations.Param;

/**
 * 关联外键存在性校验用（对齐 Node 端 tenant-db.js 的 validateRelations 里那条父表查询）。
 * 表名由内部常量提供，故走 ${}；用户维度条件在这里显式书写，与 Node 端一致。
 */
public interface RelationGuardMapper {

    String exists(@Param("table") String table, @Param("value") Object value, @Param("userId") long userId);
}
