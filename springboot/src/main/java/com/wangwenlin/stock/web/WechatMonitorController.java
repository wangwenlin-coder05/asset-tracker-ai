package com.wangwenlin.stock.web;

import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.service.WechatMonitorService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 微信窗口监听进程控制。逐行对齐 server.js 12752-12763。
 */
@RestController
@RequestMapping("/api/wechat")
public class WechatMonitorController {

    private final WechatMonitorService monitorService;

    public WechatMonitorController(WechatMonitorService monitorService) {
        this.monitorService = monitorService;
    }

    @PostMapping("/monitor/start")
    public Map<String, Object> start() {
        try {
            return monitorService.startWechatMonitor();
        } catch (Exception error) {
            String message = error.getMessage() == null ? String.valueOf(error) : error.getMessage();
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("error", "微信窗口监听启动失败");
            body.put("message", message);
            throw new ApiException(500, "微信窗口监听启动失败", body);
        }
    }

    @PostMapping("/monitor/stop")
    public Map<String, Object> stop() {
        return monitorService.stopWechatMonitor();
    }
}
