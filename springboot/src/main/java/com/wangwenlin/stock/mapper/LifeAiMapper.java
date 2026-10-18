package com.wangwenlin.stock.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * 人生规划器 AI 编排子集（/api/life/plan、/api/life/chat、/api/life/chat/stream、
 * /api/life/plan/extract、/api/life/plan/regenerate）所需的读写语句。user_id 由拦截器注入。
 */
@Mapper
public interface LifeAiMapper {

    // ---------- life_plan_nodes ----------

    List<Map<String, Object>> selectIdTitleAll();

    List<Map<String, Object>> selectIdTitleAsc();

    List<Map<String, Object>> selectAiIdTitle();

    List<Map<String, Object>> selectRecentBrief(@Param("limit") int limit);

    Map<String, Object> selectFirstSelfIdTitle();

    List<Map<String, Object>> selectCleanupRows();

    Map<String, Object> selectNodeDetailById(@Param("id") String id);

    List<Map<String, Object>> selectIdTitleDetailAll();

    Map<String, Object> selectSourceKindById(@Param("id") String id);

    Map<String, Object> selectIdById(@Param("id") String id);

    /** applyLifeOps add 的精确标题查重：SELECT id ... WHERE title = ? LIMIT 1。 */
    Map<String, Object> selectNodeIdByTitleExact(@Param("title") String title);

    /** 自动检索回填用的历史遗留占位扫描（节点侧）。 */
    List<Map<String, Object>> selectNodeLegacyIntents();

    /** 自动检索回填用的历史遗留占位扫描（每日任务侧）。 */
    List<Map<String, Object>> selectTaskLegacyIntents();

    Map<String, Object> selectNodeStatusById(@Param("id") String id);

    /** applyLifeOps add：23 列，无 deps / reference_ids。 */
    Integer insertNodeAi(Map<String, Object> node);

    /** 重生成：22 列，无 progress_note。 */
    Integer insertNodeRegen(Map<String, Object> node);

    /** upsert_self 首次插入：14 列。 */
    Integer insertNodeSelf(Map<String, Object> node);

    /** 重生成就地更新：status / start_date 由 Java 决定是否带上。 */
    Integer updateNodeRegenRow(Map<String, Object> fields);

    /** applyLifeOps 就地更新与 op=update 的动态更新。 */
    Integer updateNodeFieldsFull(Map<String, Object> fields);

    /** 把非 self 且 parent_id 空/为空的根节点挂到 self 下（带 updated_at）。 */
    Integer updateNodeParentRefsToSelf(@Param("selfId") String selfId,
                                       @Param("updatedAt") long updatedAt);

    /** 同上，但不写 updated_at（重生成路径）。 */
    Integer updateNodeParentRefsToSelfPlain(@Param("selfId") String selfId);

    Integer updateNodeSelfRow(@Param("id") String id,
                              @Param("title") String title,
                              @Param("detail") String detail,
                              @Param("domain") String domain,
                              @Param("updatedAt") long updatedAt);

    Integer updateNodeDetailRow(@Param("id") String id,
                                @Param("detail") String detail,
                                @Param("updatedAt") long updatedAt);

    Integer deleteNodeByTitle(@Param("title") String title);

    Integer deleteNodeById(@Param("id") String id);

    Integer updateNodeParentOnly(@Param("id") String id, @Param("parentId") String parentId);

    Integer updateNodeDepsOnly(@Param("id") String id, @Param("deps") String deps);

    Integer updateNodeReferenceOnly(@Param("id") String id, @Param("referenceIds") String referenceIds);

    // ---------- life_chat_messages ----------

    Map<String, Object> countChatMessages();

    // ---------- life_daily_tasks ----------

    List<Map<String, Object>> selectTaskIdTitleByDate(@Param("date") String date);

    List<Map<String, Object>> selectTaskIdTitleSupportAll();

    Integer insertDailyTask(Map<String, Object> task);

    List<Map<String, Object>> selectTaskSupportByTitle(@Param("title") String title,
                                                       @Param("limit") int limit);

    Integer updateDailyTaskRow(Map<String, Object> fields);

    Integer updateTaskSupport(@Param("id") String id,
                              @Param("support") String support,
                              @Param("updatedAt") long updatedAt);

    List<Map<String, Object>> selectOrphanTaskIdTitle();

    Integer updateTaskNodeId(@Param("id") String id, @Param("nodeId") String nodeId);

    // ---------- life_skill_profile ----------

    Map<String, Object> selectSkillIdByName(@Param("name") String name);

    Integer insertSkillRow(Map<String, Object> row);

    Integer updateSkillRow(@Param("id") String id,
                           @Param("category") String category,
                           @Param("level") String level,
                           @Param("note") String note,
                           @Param("updatedAt") long updatedAt);

    // ---------- life_energy_logs ----------

    Map<String, Object> selectEnergyIdByDate(@Param("logDate") String logDate);

    Integer insertEnergyRow(Map<String, Object> row);

    Integer updateEnergyRow(@Param("id") String id,
                            @Param("plannedMinutes") Object plannedMinutes,
                            @Param("capacityMinutes") Object capacityMinutes,
                            @Param("overload") Object overload,
                            @Param("distractions") String distractions,
                            @Param("sleepHours") Object sleepHours,
                            @Param("health") String health,
                            @Param("note") String note);

    // ---------- life_knowledge ----------

    Map<String, Object> selectKnowledgeIdByTopic(@Param("topic") String topic);

    Integer insertKnowledgeRow(Map<String, Object> row);

    Integer updateKnowledgeRow(@Param("id") String id,
                               @Param("subject") String subject,
                               @Param("content") String content,
                               @Param("wrongQuestions") String wrongQuestions,
                               @Param("tags") String tags,
                               @Param("updatedAt") long updatedAt);

    // ---------- life_calendar_events ----------

    Map<String, Object> selectEventIdByTitle(@Param("title") String title);

    Integer insertEventRow(Map<String, Object> row);

    Integer updateEventRow(@Param("id") String id,
                           @Param("eventDate") String eventDate,
                           @Param("category") String category,
                           @Param("level") String level,
                           @Param("remindDays") Object remindDays,
                           @Param("note") String note,
                           @Param("updatedAt") long updatedAt);

    // ---------- life_future_paths ----------

    Map<String, Object> selectPathIdByName(@Param("name") String name);

    Integer insertPathRow(Map<String, Object> row);

    Integer updatePathRow(@Param("id") String id,
                          @Param("advantages") String advantages,
                          @Param("risks") String risks,
                          @Param("prerequisites") String prerequisites,
                          @Param("evolution") String evolution,
                          @Param("score") Object score,
                          @Param("nodeId") String nodeId,
                          @Param("updatedAt") long updatedAt);

    // ---------- life_change_logs ----------

    Integer insertChangeLogRow(Map<String, Object> row);

    // ---------- life_persona ----------

    /** readLifePersonaRow：SELECT * FROM life_persona ORDER BY updated_at DESC LIMIT 1。 */
    Map<String, Object> selectPersonaRow();

    /** applyLifeOps persona：库中还没有画像时先插一条全空行。 */
    Integer insertPersonaEmpty(Map<String, Object> row);

    /** 只更新 AI 明确给出的维度（dynamic set），其余维度保留原内容。 */
    Integer updatePersonaFields(Map<String, Object> fields);

    // ---------- life_retrieval_queue ----------

    Integer updateQueueDone(@Param("id") String id,
                            @Param("result") String result,
                            @Param("fromCache") Object fromCache,
                            @Param("updatedAt") long updatedAt);

    Integer updateQueueFailed(@Param("id") String id,
                              @Param("result") String result,
                              @Param("updatedAt") long updatedAt);
}
