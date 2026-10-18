package com.wangwenlin.stock.web;

import com.wangwenlin.stock.service.ExtractLearnService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * 用户纠正记忆（extract_learn）查询与写入。注意前缀为 /api/extract（非 /api/wechat）。
 */
@RestController
@RequestMapping("/api/extract")
public class ExtractLearnController {

    private final ExtractLearnService service;

    public ExtractLearnController(ExtractLearnService service) {
        this.service = service;
    }

    @GetMapping("/learn")
    public ResponseEntity<Object> learn(@RequestParam(value = "q", required = false) String q) {
        List<Map<String, Object>> rows = service.learn(q);
        if (rows == null) {
            // 等价 Node 端 res.json(null)：响应体为字面量 null，而非空响应
            return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON)
                    .body("null".getBytes(StandardCharsets.UTF_8));
        }
        return ResponseEntity.ok(rows);
    }

    @PostMapping("/learn")
    public Map<String, Object> save(@RequestBody(required = false) Map<String, Object> body) {
        return service.save(body);
    }
}
