package com.wangwenlin.stock.mapper;

import com.wangwenlin.stock.model.WoolItemRow;
import com.wangwenlin.stock.model.WoolNoteRow;
import org.apache.ibatis.annotations.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * 薅羊毛（wool_items / wool_notes / wool_daily_amounts）表访问。
 * SQL 内不写 user_id —— 由租户拦截器自动注入，与 Node 端行为一致。
 */
public interface WoolMapper {

    /** GET /api/wool：全量记录，按日期与创建时间倒序。 */
    List<WoolItemRow> listItems();

    /** PUT/DELETE /api/wool/:id：锁定待改动的记录。 */
    WoolItemRow lockItem(@Param("id") String id);

    /** applyWoolDepositDelta：锁定并读取目标存款项。 */
    Map<String, Object> lockDepositItem(@Param("id") String id);

    /** applyWoolDepositDelta：更新存款余额。 */
    void updateDepositAmount(@Param("id") String id, @Param("amount") Object amount);

    /** PUT /api/wool/:id：该记录已产生的资金影响合计。 */
    BigDecimal sumWoolTransactions(@Param("woolItemId") String woolItemId);

    /** PUT/DELETE /api/wool/:id：清理该记录关联的资金明细。 */
    void deleteWoolTransactions(@Param("woolItemId") String woolItemId);

    /** applyWoolDepositDelta：写入资金明细。 */
    void insertWoolTransaction(Map<String, Object> data);

    void insertItem(Map<String, Object> data);

    void updateItem(Map<String, Object> data);

    void deleteItem(@Param("id") String id);

    /** GET /api/wool/notes：按类型筛选（type 为 null 时不筛选）。 */
    List<WoolNoteRow> listNotes(@Param("type") String type);

    void insertNote(Map<String, Object> data);

    /** 只更新请求里实际出现过的字段；字段已在 Service 侧判定，故直接按 containsKey 判断。 */
    void updateNote(Map<String, Object> data);

    void deleteNote(@Param("id") String id);

    /** GET /api/wool/calendar：按月聚合每类金额。 */
    List<Map<String, Object>> calendarItems(@Param("pattern") String pattern);

    /** GET /api/wool/calendar：按月取快速录入金额。 */
    List<Map<String, Object>> calendarQuickAmounts(@Param("pattern") String pattern);

    /** GET /api/wool/daily/:date：查当日快速录入金额。 */
    Map<String, Object> findDaily(@Param("date") String date);

    void updateDaily(Map<String, Object> data);

    void insertDaily(Map<String, Object> data);
}
