package com.wangwenlin.stock.web;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 系统心跳。对齐 Node 端 server.js 10984-10988：
 * SERVER_START_TIME 在进程启动时取一次，接口回 { startTime }。
 */
@RestController
public class SystemController {

    /** 对齐 Node 端模块加载时取一次的 SERVER_START_TIME。 */
    private static final long START_TIME = System.currentTimeMillis();

    @GetMapping("/api/heartbeat")
    public Map<String, Object> heartbeat() {
        Map<String, Object> result = new LinkedHashMap<>(1);
        result.put("startTime", START_TIME);
        return result;
    }
}
