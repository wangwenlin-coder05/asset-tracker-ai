package com.wangwenlin.stock.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 人生规划模块「整表清空」专用。等价 server.js 9022 / 9081 里的
 * {@code DELETE FROM ${table}} 循环。
 *
 * <p>表名用 {@code ${}} 拼接 —— 调用方必须先用硬编码白名单校验表名，切勿传入外部输入。
 * 租户条件仍由 TenantLineInnerInterceptor 自动注入。</p>
 */
@Mapper
public interface LifePurgeMapper {

    Integer deleteAllFromTable(@Param("table") String table);
}
