package com.wangwenlin.stock.web;

import com.wangwenlin.stock.service.WechatCategoryAdminService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 分类反馈、分类规则管理与历史消息重新分类。
 */
@RestController
@RequestMapping("/api/wechat")
public class WechatCategoryController {

    private final WechatCategoryAdminService service;

    public WechatCategoryController(WechatCategoryAdminService service) {
        this.service = service;
    }

    @PostMapping("/category-feedback")
    public Map<String, Object> categoryFeedback(@RequestBody(required = false) Map<String, Object> body)
            throws Exception {
        return service.categoryFeedback(body);
    }

    @GetMapping("/category-rules")
    public Map<String, Object> categoryRules(@RequestParam(value = "category", required = false) String category,
                                             @RequestParam(value = "learnedLimit", required = false) String learnedLimit,
                                             @RequestParam(value = "pageSize", required = false) String pageSize,
                                             @RequestParam(value = "learnedOffset", required = false) String learnedOffset,
                                             @RequestParam(value = "offset", required = false) String offset) {
        return service.categoryRules(category, learnedLimit, pageSize, learnedOffset, offset);
    }

    @PutMapping("/category-rules/system/{id}")
    public Map<String, Object> updateSystemRule(@PathVariable("id") String id,
                                                @RequestBody(required = false) Map<String, Object> body) {
        return service.updateSystemRule(id, body);
    }

    @DeleteMapping("/category-rules/learned/{id}")
    public Map<String, Object> deleteLearnedRule(@PathVariable("id") String id) {
        return service.deleteLearnedRule(id);
    }

    @PostMapping("/category-rules/system/reset")
    public Map<String, Object> resetSystemRules() {
        return service.resetSystemRules();
    }

    @PostMapping("/category-rules/learned")
    public Map<String, Object> addLearnedRule(@RequestBody(required = false) Map<String, Object> body) {
        return service.addLearnedRule(body);
    }

    @PostMapping("/reclassify")
    public Map<String, Object> reclassify() {
        return service.reclassify();
    }
}
