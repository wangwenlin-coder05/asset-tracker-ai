package com.wangwenlin.stock.mapper;

import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

public interface TxLogMapper {

    Integer insertLog(Map<String, Object> data);

    List<Map<String, Object>> list(@Param("limit") int limit, @Param("offset") int offset);

    Long count();
}
