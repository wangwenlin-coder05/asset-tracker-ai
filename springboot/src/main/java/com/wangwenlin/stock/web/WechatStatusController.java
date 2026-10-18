package com.wangwenlin.stock.web;

import com.wangwenlin.stock.service.WechatMonitorService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 微信模块运行状态。逐行对齐 server.js 12450-12452。
 */
@RestController
@RequestMapping("/api/wechat")
public class WechatStatusController {

    private final WechatMonitorService monitorService;

    public WechatStatusController(WechatMonitorService monitorService) {
        this.monitorService = monitorService;
    }

    @GetMapping("/status")
    public Map<String, Object> status() {
        // 对齐 server.js 12451：{ ...getWechatMonitorStatus(), source: 'java/WechatWindowMonitor.java' }
        // 源对象无 source 键 → 追加在末尾，与 Node 键序一致。
        Map<String, Object> out = new LinkedHashMap<>(monitorService.getWechatMonitorStatus());
        out.put("source", "java/WechatWindowMonitor.java");
        return out;
    }
}
