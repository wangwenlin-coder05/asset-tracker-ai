package com.wangwenlin.stock.service;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * 等价 wechat-extractor.js 227-236 行的 {@code monitorState} 单例。
 * <p>字段与 Node 一一对应：{@code process/running/state/chatName/lastError/startedAt/stopping}，
 * {@code events} 等价 Node 的内存事件列表（不设数量上限，EVENTS_LIMIT 仅作防御兜底）。
 */
@Component
public class WechatMonitorState {

    public volatile Process process;
    public volatile boolean running;
    public volatile String state = "STOPPED";
    public volatile String chatName = "";
    public volatile String lastError = "";
    public volatile String startedAt = "";
    public volatile boolean stopping;

    /** 内存事件列表（新事件 unshift 到首位，等价 Node 的 events.unshift）。 */
    public final List<Map<String, Object>> events = new CopyOnWriteArrayList<>();

    /** 按 id 查找内存事件；找不到返回 null（等价 Node 的 findIndex 语义）。 */
    public Map<String, Object> findEvent(String id) {
        for (Map<String, Object> event : events) {
            if (Objects.equals(String.valueOf(event.get("id")), String.valueOf(id))) {
                return event;
            }
        }
        return null;
    }

    /** 等价 Node {@code monitorState.events.unshift(event)}。 */
    public void unshift(Map<String, Object> event) {
        events.add(0, event);
    }
}
