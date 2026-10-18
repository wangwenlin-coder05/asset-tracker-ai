package com.wangwenlin.stock.service;

import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.common.Ids;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.mapper.QuizMapper;
import com.wangwenlin.stock.model.QuizAnswerRow;
import com.wangwenlin.stock.model.QuizQuestionRow;
import com.wangwenlin.stock.tenant.UserContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 练题（/api/quiz）7 个路由。对齐 Node 端 server.js 10263-10443，含 AI 评价提示词逐字复刻。
 */
@Service
public class QuizService {

    private static final Logger log = LoggerFactory.getLogger(QuizService.class);
    /** multer quizStorage 的 limits.fileSize = 10MB。 */
    private static final long MAX_UPLOAD_BYTES = 10L * 1024 * 1024;

    /** 有正确答案时的评价系统提示词（逐行对齐 Node 10400-10413）。 */
    private static final String SCORING_SYSTEM_PROMPT = String.join("\n",
            "你是严格的股票集合竞价分析评分专家。你必须严格对比用户的答案与正确答案，核心判断（如趋势方向：上涨/下跌/震荡/洗盘/出货等）必须一致才能给高匹配度。",
            "",
            "评分标准：",
            "- 核心判断完全相反（如正确答案是\"震荡洗盘\"，用户答\"超级下跌\"）：匹配度 0-15%，必须明确指出核心判断错误。",
            "- 核心判断方向相反（如正确答案是\"洗盘\"，用户答\"出货\"）：匹配度 20-40%，指出方向性错误。",
            "- 核心判断大致接近但有偏差：匹配度 50-70%。",
            "- 核心判断基本正确，细节有遗漏：匹配度 75-90%。",
            "- 核心判断完全正确，分析全面：匹配度 90-100%。",
            "",
            "请按以下格式输出：",
            "1. 匹配度：X%",
            "2. 核心判断对比（明确指出是否一致）",
            "3. 亮点",
            "4. 不足",
            "5. 改进建议",
            "6. 鼓励语");

    /** 无正确答案时的评价系统提示词（Node 10423）。 */
    private static final String OPEN_SYSTEM_PROMPT = "你是股票集合竞价分析专家。评价用户的分析是否合理，给出专业补充。用中文回复，简洁明了。";

    private final QuizMapper mapper;
    private final UploadService uploadService;
    private final AiCallService aiCallService;

    public QuizService(QuizMapper mapper, UploadService uploadService, AiCallService aiCallService) {
        this.mapper = mapper;
        this.uploadService = uploadService;
        this.aiCallService = aiCallService;
    }

    /** GET /api/quiz */
    public List<Map<String, Object>> list() {
        try {
            List<Map<String, Object>> result = new ArrayList<>();
            for (QuizQuestionRow row : mapper.listQuestions()) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", row.getId());
                item.put("stockName", row.getStockName());
                item.put("stockCode", row.getStockCode());
                item.put("quizDate", row.getQuizDate());
                item.put("image", JsValues.orEmpty(row.getImage()));
                item.put("correctAnswer", JsValues.orEmpty(row.getCorrectAnswer()));
                item.put("note", JsValues.orEmpty(row.getNote()));
                item.put("createdAt", row.getCreatedAt());
                result.add(item);
            }
            return result;
        } catch (Exception error) {
            log.error("获取练题列表失败", error);
            throw new ApiException(500, error.getMessage());
        }
    }

    /** POST /api/quiz/upload-image：图片落盘 uploads/quiz/，回包路径由全局改写器补上 users/&lt;uid&gt;。 */
    public Map<String, Object> uploadImage(MultipartFile image) {
        if (image == null) {
            throw new ApiException(400, "未上传文件");
        }
        String contentType = image.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            throw new ApiException(400, "仅支持图片文件");
        }
        String original = image.getOriginalFilename() == null ? "" : image.getOriginalFilename();
        LocalDate today = LocalDate.now();
        String dateStr = "" + today.getYear() + pad2(today.getMonthValue()) + pad2(today.getDayOfMonth());
        String filename = "quiz" + dateStr + Ids.base36Six() + UploadService.extname(original);
        String imagePath = uploadService.store(UserContext.requireUserId(), "quiz", image, filename, MAX_UPLOAD_BYTES);
        Map<String, Object> result = new LinkedHashMap<>(1);
        result.put("imagePath", imagePath);
        return result;
    }

    /** POST /api/quiz：落库值一律 {@code || ''}，但回包原样回显请求体里的字段。 */
    public Map<String, Object> createQuestion(Object rawBody) {
        Map<String, Object> body = asMap(rawBody);
        try {
            String id = Ids.genId();
            long now = System.currentTimeMillis();
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("id", id);
            data.put("stockName", JsValues.orEmpty(body.get("stockName")));
            data.put("stockCode", JsValues.orEmpty(body.get("stockCode")));
            data.put("quizDate", JsValues.orEmpty(body.get("quizDate")));
            data.put("image", JsValues.orEmpty(body.get("image")));
            data.put("correctAnswer", JsValues.orEmpty(body.get("correctAnswer")));
            data.put("note", JsValues.orEmpty(body.get("note")));
            data.put("createdAt", now);
            mapper.insertQuestion(data);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("id", id);
            for (String key : List.of("stockName", "stockCode", "quizDate", "image", "correctAnswer", "note")) {
                if (body.containsKey(key)) {
                    result.put(key, body.get(key));
                }
            }
            return result;
        } catch (Exception error) {
            log.error("新增练题失败", error);
            throw new ApiException(500, error.getMessage());
        }
    }

    /** PUT /api/quiz/:id：可写字段一个都没出现 → 直接 {ok:true}，不产生 UPDATE。 */
    public Map<String, Object> updateQuestion(String id, Object rawBody) {
        Map<String, Object> body = asMap(rawBody);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", id);
        for (String key : List.of("stockName", "stockCode", "quizDate", "image", "correctAnswer", "note")) {
            if (body.containsKey(key)) {
                data.put(key, body.get(key));
            }
        }
        if (data.size() == 1) {
            return ok();
        }
        try {
            mapper.updateQuestion(data);
            return ok();
        } catch (Exception error) {
            log.error("更新练题失败", error);
            throw new ApiException(500, error.getMessage());
        }
    }

    /** DELETE /api/quiz/:id：先删该题作答，再删题目。 */
    public Map<String, Object> deleteQuestion(String id) {
        try {
            mapper.deleteAnswers(id);
            mapper.deleteQuestion(id);
            return ok();
        } catch (Exception error) {
            log.error("删除练题失败", error);
            throw new ApiException(500, error.getMessage());
        }
    }

    /** POST /api/quiz/answer */
    public Map<String, Object> saveAnswer(Object rawBody) {
        Map<String, Object> body = asMap(rawBody);
        Object questionId = body.get("questionId");
        if (!JsValues.truthy(questionId)) {
            throw new ApiException(400, "缺少题目ID");
        }
        try {
            String id = Ids.genId();
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("id", id);
            data.put("questionId", questionId);
            data.put("userAnswer", JsValues.orEmpty(body.get("userAnswer")));
            data.put("aiEvaluation", JsValues.orEmpty(body.get("aiEvaluation")));
            data.put("createdAt", System.currentTimeMillis());
            mapper.insertAnswer(data);
            Map<String, Object> result = new LinkedHashMap<>(1);
            result.put("id", id);
            return result;
        } catch (Exception error) {
            log.error("保存练题作答失败", error);
            throw new ApiException(500, error.getMessage());
        }
    }

    /** GET /api/quiz/answers/:questionId */
    public List<Map<String, Object>> answers(String questionId) {
        try {
            List<Map<String, Object>> result = new ArrayList<>();
            for (QuizAnswerRow row : mapper.listAnswers(questionId)) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", row.getId());
                item.put("questionId", row.getQuestionId());
                item.put("userAnswer", JsValues.orEmpty(row.getUserAnswer()));
                item.put("aiEvaluation", JsValues.orEmpty(row.getAiEvaluation()));
                item.put("createdAt", row.getCreatedAt());
                result.add(item);
            }
            return result;
        } catch (Exception error) {
            log.error("获取练题作答失败", error);
            throw new ApiException(500, error.getMessage());
        }
    }

    /** POST /api/quiz/evaluate：有正确答案走严格对比提示词，否则走开放评价提示词。 */
    public Map<String, Object> evaluate(Object rawBody) {
        Map<String, Object> body = asMap(rawBody);
        Object questionId = body.get("questionId");
        Object userAnswer = body.get("userAnswer");
        if (!JsValues.truthy(questionId) || !JsValues.truthy(userAnswer) || text(userAnswer).trim().isEmpty()) {
            throw new ApiException(400, "缺少题目ID或用户答案");
        }
        QuizQuestionRow question;
        try {
            question = mapper.findQuestion(String.valueOf(questionId));
        } catch (Exception error) {
            log.error("AI评价失败", error);
            throw new ApiException(500, "AI评价失败: " + error.getMessage());
        }
        if (question == null) {
            throw new ApiException(404, "题目不存在");
        }

        String userAnswerTrimmed = text(userAnswer).trim();
        String correctAnswer = JsValues.truthy(question.getCorrectAnswer()) ? text(question.getCorrectAnswer()).trim() : "";
        String titleLine = "题目：" + question.getStockName() + "（" + question.getStockCode() + "）" + question.getQuizDate() + " 集合竞价分析";

        String systemPrompt;
        String userPrompt;
        if (!correctAnswer.isEmpty()) {
            systemPrompt = SCORING_SYSTEM_PROMPT;
            userPrompt = String.join("\n",
                    titleLine,
                    "",
                    "正确答案：" + correctAnswer,
                    "",
                    "用户答案：" + userAnswerTrimmed,
                    "",
                    "请严格对比评价。重点检查：用户的核心趋势判断（上涨/下跌/震荡/洗盘/出货等）是否与正确答案一致。如果不一致，必须明确指出来，不能给面子分。");
        } else {
            systemPrompt = OPEN_SYSTEM_PROMPT;
            boolean hasImage = JsValues.truthy(question.getImage()) && question.getImage().startsWith("uploads/");
            userPrompt = String.join("\n",
                    titleLine,
                    "",
                    JsValues.truthy(question.getNote()) ? "备注：" + question.getNote() : "",
                    "",
                    "用户答案：" + userAnswerTrimmed,
                    "",
                    hasImage ? "请根据图片和用户答案进行评价。" : "（该题目暂无图片）");
        }

        String model = JsValues.truthy(body.get("model")) ? text(body.get("model")) : "agnes";
        String evaluation;
        try {
            evaluation = aiCallService.callAI(systemPrompt, userPrompt, question.getImage(), model, 30000, 800);
        } catch (Exception error) {
            log.error("AI评价失败", error);
            throw new ApiException(500, "AI评价失败: " + error.getMessage());
        }
        Map<String, Object> result = new LinkedHashMap<>(1);
        result.put("evaluation", evaluation == null ? "" : evaluation);
        return result;
    }

    private static Map<String, Object> ok() {
        Map<String, Object> map = new LinkedHashMap<>(1);
        map.put("ok", true);
        return map;
    }

    /** 对齐 JS 模板字符串里的隐式 toString（null → '' 由调用处的 truthy 判断兜住）。 */
    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    /** 对齐 Node 端日期拼接里的 {@code (n + '').padStart(2, '0')}。 */
    private static String pad2(int value) {
        return value < 10 ? "0" + value : String.valueOf(value);
    }

    private static Map<String, Object> asMap(Object body) {
        Map<String, Object> map = new LinkedHashMap<>();
        if (body instanceof Map<?, ?> raw) {
            for (Map.Entry<?, ?> entry : raw.entrySet()) {
                map.put(String.valueOf(entry.getKey()), entry.getValue());
            }
        }
        return map;
    }
}
