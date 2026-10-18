package com.wangwenlin.stock.mapper;

import com.wangwenlin.stock.model.BuyRecordRow;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

public interface BuyRecordMapper {

    List<BuyRecordRow> listByStockId(@Param("stockId") String stockId);

    List<BuyRecordRow> listByStockIds(@Param("stockIds") List<String> stockIds);

    Integer insertRecord(Map<String, Object> data);

    Integer deleteById(@Param("id") String id);

    Integer updateFields(Map<String, Object> data);
}
