package com.wangwenlin.stock.web;

import com.wangwenlin.stock.service.WechatAiLogicService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * AI 推荐逻辑提取、训练样本保存与训练数据总览。
 */
@RestController
@RequestMapping("/api/wechat")
public class WechatAiLogicController {

    private final WechatAiLogicService service;

    public WechatAiLogicController(WechatAiLogicService service) {
        this.service = service;
    }

    @PostMapping("/ai/extract-logic")
    public Map<String, Object> extractLogic(@RequestBody(required = false) Map<String, Object> body) {
        return service.extractLogic(body);
    }

    @PostMapping("/logic/train")
    public Map<String, Object> trainLogic(@RequestBody(required = false) Map<String, Object> body) throws Exception {
        return service.trainLogic(body);
    }

    @GetMapping("/training-data")
    public Map<String, Object> trainingData(@RequestParam(value = "page", required = false) String page,
                                            @RequestParam(value = "pageSize", required = false) String pageSize)
            throws Exception {
        return service.trainingData(page, pageSize);
    }
}
