package com.wangwenlin.stock.model;

import lombok.Data;

/** quiz_questions 表行。 */
@Data
public class QuizQuestionRow {

    private String id;
    private String stockName;
    private String stockCode;
    private String quizDate;
    private String image;
    private String correctAnswer;
    private String note;
    private Long createdAt;
}
