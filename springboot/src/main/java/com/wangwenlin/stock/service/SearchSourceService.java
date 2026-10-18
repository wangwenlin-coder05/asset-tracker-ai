package com.wangwenlin.stock.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wangwenlin.stock.common.JsStrings;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 联网检索数据源清单（顺序 + 展示字段）—— 对齐 Node 端 backend/web-search.js 的
 * SOURCES / DEFAULT_SOURCE_IDS / getSourceOrder / setSourceOrder / parseSearchSourceOrder。
 *
 * <p>顺序由「系统设置里手动排序」决定（PUT /api/ai/settings 的 search_source_order），
 * 未设置的引擎按「默认顺序里的位置」插回 —— 见 setSourceOrder 的等价实现。
 */
@Service
public class SearchSourceService {

    /** 与 Node 的 SOURCES 完全一致（顺序即默认顺序）。 */
    private static final List<SourceInfo> DEFAULT_SOURCES = List.of(
            new SourceInfo("metaso", "秘塔 Metaso", "国内 AI 原生搜索，优先抓 gov.cn 官网，需填写 API Key", true),
            new SourceInfo("searxng", "SearXNG", "本地自托管聚合搜索（百度/搜狗/360/夸克/中国搜索），随服务自动拉起，无额度上限", false),
            new SourceInfo("bing", "Bing 必应", "免密钥网页搜索，国内可直连", false),
            new SourceInfo("volcengine", "豆包搜索（火山引擎）", "字节官方搜索 API，每月 500 次免费，需填写 API Key", true),
            new SourceInfo("claw", "Claw Search", "永久免费第三方聚合，无需密钥；服务偶发 502，仅作兜底", false),
            new SourceInfo("openserp", "OpenSERP", "备选本地自托管聚合搜索，需本机已启动", false),
            new SourceInfo("duckduckgo", "DuckDuckGo", "免密钥，国内网络通常不可达，仅海外兜底", false),
            new SourceInfo("tavily", "Tavily", "终极兜底，需在下方填写 API Key", true)
    );

    /** 与 Node 的 DEFAULT_SOURCE_IDS = SOURCES.map(s => s.id) 一致。 */
    private static final List<String> DEFAULT_SOURCE_IDS = List.of(
            "metaso", "searxng", "bing", "volcengine", "claw", "openserp", "duckduckgo", "tavily");

    private final AiSettingsService settingsService;
    private final ObjectMapper objectMapper;

    /** 当前生效的检索源顺序（进程内状态，等价 Node 端被原地重排的 SOURCES 数组）。 */
    private final List<SourceInfo> sources = new ArrayList<>(DEFAULT_SOURCES);

    /** 是否已按数据库里保存的顺序初始化过（等价 Node 启动时的那一次 setSourceOrder）。 */
    private boolean loaded = false;

    public SearchSourceService(AiSettingsService settingsService, ObjectMapper objectMapper) {
        this.settingsService = settingsService;
        this.objectMapper = objectMapper;
    }

    /**
     * 首次调用时按系统设置里保存的 search_source_order 重排 —— 对齐 Node 启动时
     * 从 ai_settings 读取并调用 setSourceOrder 的行为，避免读到默认顺序。
     */
    private void ensureLoaded() {
        if (loaded) {
            return;
        }
        synchronized (this) {
            if (loaded) {
                return;
            }
            try {
                String raw = settingsService.rawValue("search_source_order");
                if (raw != null && !raw.isEmpty()) {
                    setSourceOrder(parseSourceOrder(raw));
                }
            } catch (Exception ignored) {
                // 读取失败时退回默认顺序，与 Node 端「查不到就保持默认」一致
            }
            loaded = true;
        }
    }

    /** 等价 getSourceOrder()。 */
    public synchronized List<Map<String, Object>> getSourceOrder() {
        ensureLoaded();
        List<Map<String, Object>> result = new ArrayList<>();
        for (SourceInfo source : sources) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", source.id());
            item.put("name", source.name());
            item.put("desc", source.desc() == null ? "" : source.desc());
            item.put("needKey", source.needKey());
            result.add(item);
        }
        return result;
    }

    /**
     * 等价 setSourceOrder(ids)：
     * ① 先把用户列出的有效 id 按序取出；② 空列表视为未设置，顺序不变；
     * ③ 未列出的源按「默认顺序里的位置」插回（而不是一律堆到末尾），并把顺序锁定。
     */
    public synchronized void setSourceOrder(List<String> ids) {
        List<String> wanted = new ArrayList<>();
        for (String id : ids == null ? List.<String>of() : ids) {
            String value = JsStrings.trim(id == null ? "" : String.valueOf(id)).toLowerCase(Locale.ROOT);
            if (!value.isEmpty()) {
                wanted.add(value);
            }
        }
        List<SourceInfo> picked = new ArrayList<>();
        for (String id : wanted) {
            for (SourceInfo source : sources) {
                if (source.id().equals(id) && !picked.contains(source)) {
                    picked.add(source);
                }
            }
        }
        if (picked.isEmpty()) {
            return;
        }
        List<SourceInfo> sortedByDefaultRank = new ArrayList<>(sources);
        sortedByDefaultRank.sort((a, b) -> Integer.compare(rank(a.id()), rank(b.id())));
        for (SourceInfo source : sortedByDefaultRank) {
            if (picked.contains(source)) {
                continue;
            }
            int at = -1;
            for (int i = 0; i < picked.size(); i++) {
                if (rank(picked.get(i).id()) > rank(source.id())) {
                    at = i;
                    break;
                }
            }
            if (at == -1) {
                picked.add(source);
            } else {
                picked.add(at, source);
            }
        }
        sources.clear();
        sources.addAll(picked);
    }

    private static int rank(String id) {
        int index = DEFAULT_SOURCE_IDS.indexOf(id);
        return index == -1 ? DEFAULT_SOURCE_IDS.size() : index;
    }

    /** 等价 parseSearchSourceOrder(value)：数组直接用；字符串按 JSON 解析；其余为空数组。 */
    public List<String> parseSourceOrder(Object value) {
        if (value instanceof List<?> list) {
            List<String> result = new ArrayList<>();
            for (Object item : list) {
                if (item != null) {
                    result.add(String.valueOf(item));
                }
            }
            return result;
        }
        String text = value == null ? "" : String.valueOf(value);
        if (text.isEmpty()) {
            return new ArrayList<>();
        }
        try {
            Object parsed = objectMapper.readValue(text, Object.class);
            if (parsed instanceof List<?> list) {
                List<String> result = new ArrayList<>();
                for (Object item : list) {
                    if (item != null) {
                        result.add(String.valueOf(item));
                    }
                }
                return result;
            }
            return new ArrayList<>();
        } catch (Exception ignored) {
            return new ArrayList<>();
        }
    }

    private record SourceInfo(String id, String name, String desc, boolean needKey) {
    }
}
