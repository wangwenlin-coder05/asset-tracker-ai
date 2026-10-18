package com.wangwenlin.stock.mapper;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;

import java.util.Map;

/** wechat_category_feedback 表写入。等价 server.js 中对应的 INSERT。 */
@Mapper
public interface WechatFeedbackMapper {

    @Insert("INSERT INTO wechat_category_feedback"
            + " (event_id, message_text, predicted_category, user_correct, user_corrected_category, learned_keywords, created_at)"
            + " VALUES (#{eventId}, #{messageText}, #{predictedCategory}, #{userCorrect}, #{userCorrectedCategory}, #{learnedKeywords}, #{createdAt})")
    int insertFeedback(Map<String, Object> data);
}
