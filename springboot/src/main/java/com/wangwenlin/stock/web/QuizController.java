package com.wangwenlin.stock.web;

import com.wangwenlin.stock.service.QuizService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

/**
 * 练题接口。对齐 Node 端 server.js 10263-10443：
 * GET/POST /api/quiz、POST /api/quiz/upload-image、POST /api/quiz/answer、
 * GET /api/quiz/answers/:questionId、POST /api/quiz/evaluate、PUT/DELETE /api/quiz/:id。
 */
@RestController
public class QuizController {

    private final QuizService service;

    public QuizController(QuizService service) {
        this.service = service;
    }

    @GetMapping("/api/quiz")
    public List<Map<String, Object>> list() {
        return service.list();
    }

    @PostMapping("/api/quiz")
    public Map<String, Object> createQuestion(@RequestBody(required = false) Object body) {
        return service.createQuestion(body);
    }

    @PostMapping("/api/quiz/upload-image")
    public Map<String, Object> uploadImage(@RequestParam(value = "image", required = false) MultipartFile image) {
        return service.uploadImage(image);
    }

    @PostMapping("/api/quiz/answer")
    public Map<String, Object> saveAnswer(@RequestBody(required = false) Object body) {
        return service.saveAnswer(body);
    }

    @GetMapping("/api/quiz/answers/{questionId}")
    public List<Map<String, Object>> answers(@PathVariable("questionId") String questionId) {
        return service.answers(questionId);
    }

    @PostMapping("/api/quiz/evaluate")
    public Map<String, Object> evaluate(@RequestBody(required = false) Object body) {
        return service.evaluate(body);
    }

    @PutMapping("/api/quiz/{id}")
    public Map<String, Object> updateQuestion(@PathVariable("id") String id, @RequestBody(required = false) Object body) {
        return service.updateQuestion(id, body);
    }

    @DeleteMapping("/api/quiz/{id}")
    public Map<String, Object> removeQuestion(@PathVariable("id") String id) {
        return service.deleteQuestion(id);
    }
}
