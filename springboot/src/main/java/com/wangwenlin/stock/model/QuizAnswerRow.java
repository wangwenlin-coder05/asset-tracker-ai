package com.wangwenlin.stock.model;

import lombok.Data;

/** quiz_answers 表行。 */
@Data
public class QuizAnswerRow {

    private String id;
    private String questionId;
    private String userAnswer;
    private String aiEvaluation;
    private Long createdAt;
}
