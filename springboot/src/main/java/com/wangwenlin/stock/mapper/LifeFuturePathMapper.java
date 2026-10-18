package com.wangwenlin.stock.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * life_future_paths（未来可选发展路径库）读写。user_id 由拦截器注入。
 */
@Mapper
public interface LifeFuturePathMapper {

    /** 等价 listLifePaths：SELECT * ORDER BY sort_order ASC, created_at ASC。 */
    List<Map<String, Object>> selectAll();

    /** 等价 lifePersonaContext：SELECT * ORDER BY sort_order ASC LIMIT 40。 */
    List<Map<String, Object>> selectTop40();

    /** 等价「同名路径就地更新」的判重查询。 */
    Map<String, Object> selectByName(@Param("name") String name);

    /** 整行插入。 */
    Integer insertPath(Map<String, Object> path);

    /**
     * 等价 PUT /api/life/paths/:id 的动态 UPDATE：fields 只包含本次请求里出现过的列
     * （name / advantages / risks / prerequisites / evolution / node_id / score / sort_order），
     * 另必带 id / updated_at。
     */
    Integer updatePath(Map<String, Object> fields);

    /** 按主键删除。 */
    Integer deleteById(@Param("id") String id);
}
