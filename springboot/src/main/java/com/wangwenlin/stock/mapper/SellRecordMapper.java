package com.wangwenlin.stock.mapper;

import com.wangwenlin.stock.model.SellRecordRow;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

public interface SellRecordMapper {

    List<SellRecordRow> listByStockId(@Param("stockId") String stockId);

    List<SellRecordRow> listByStockIds(@Param("stockIds") List<String> stockIds);

    Integer insertRecord(Map<String, Object> data);

    Integer deleteById(@Param("id") String id);

    Integer updateFields(Map<String, Object> data);
}
