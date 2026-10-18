package com.wangwenlin.stock.mapper;

import com.wangwenlin.stock.model.StockRow;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * stocks 表访问。SQL 内一律不写 user_id —— 由 TenantLineInnerInterceptor 自动注入，
 * 与 Node 端 tenant-db.js 的 AST 改写语义一致。
 */
public interface StockMapper {

    List<StockRow> listByBoard(@Param("board") String board);

    StockRow findById(@Param("id") String id);

    /** 做 T 支持：按 code + board 查最近一条，用于复用/重新激活。 */
    Map<String, Object> findReusableByCode(@Param("code") String code, @Param("board") String board);

    Integer insertStock(Map<String, Object> data);

    /** 动态部分更新，data 中必须包含 id。 */
    Integer updateFields(Map<String, Object> data);

    Integer clearStock(@Param("id") String id);

    Integer deleteById(@Param("id") String id);

    Integer reactivate(@Param("id") String id, @Param("position") String position);

    Integer updateName(@Param("id") String id, @Param("name") String name);

    /** 新增买入记录时若该股此前已清仓，则重新激活。 */
    Integer reactivateForBuy(@Param("id") String id);

    /** 行锁存在性校验，对齐 Node 端 SELECT id FROM stocks WHERE id = ? FOR UPDATE。 */
    Map<String, Object> lockById(@Param("id") String id);

    /** 租户内的关联存在性校验，对齐 tenant-db.js 的 validateRelations（RELATIONS: *_records/tx_logs.stock_id → stocks）。 */
    String existsById(@Param("id") String id);
}
