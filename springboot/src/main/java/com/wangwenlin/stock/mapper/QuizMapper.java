package com.wangwenlin.stock.mapper;

import com.wangwenlin.stock.model.QuizAnswerRow;
import com.wangwenlin.stock.model.QuizQuestionRow;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/** 练题（quiz_questions / quiz_answers）表访问。user_id 由租户拦截器自动注入。 */
public interface QuizMapper {

    /** GET /api/quiz */
    List<QuizQuestionRow> listQuestions();

    /** POST /api/quiz */
    void insertQuestion(Map<String, Object> data);

    /** PUT /api/quiz/:id：只更新请求里出现过的字段。 */
    void updateQuestion(Map<String, Object> data);

    /** DELETE /api/quiz/:id 之前先清掉该题所有作答。 */
    void deleteAnswers(@Param("questionId") String questionId);

    /** DELETE /api/quiz/:id */
    void deleteQuestion(@Param("id") String id);

    /** POST /api/quiz/answer、POST /api/quiz/evaluate 需要先确认题目归属当前用户。 */
    QuizQuestionRow findQuestion(@Param("id") String id);

    /** POST /api/quiz/answer */
    void insertAnswer(Map<String, Object> data);

    /** GET /api/quiz/answers/:questionId */
    List<QuizAnswerRow> listAnswers(@Param("questionId") String questionId);
}
