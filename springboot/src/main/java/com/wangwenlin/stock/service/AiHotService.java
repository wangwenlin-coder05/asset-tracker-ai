package com.wangwenlin.stock.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.common.JsStrings;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.common.Utf8Js;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

import java.nio.charset.Charset;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * AI 创作工作台的免费热榜聚合与网页正文解析 —— 对齐 Node 端 server.js 中
 * /api/ai/hot/platforms、/api/ai/hot、/api/ai/hot/batch、/api/ai/article-parse 四个路由。
 *
 * <p>注意 Node 端口径：{@code HOT_SOURCES[0].platforms} 是一个以「属性名」为键的对象，
 * 其中 itHome 的展示 key 是 ithome；列表接口暴露的是 {@code p.key}（小写 ithome），
 * 但查询接口按「属性名 itHome」校验和请求 —— 此处完整复刻这一不一致，保证行为一致。
 */
@Service
public class AiHotService {

    /** 属性名（校验/请求用） → 展示 key 与中文名。 */
    private static final List<PlatformInfo> PLATFORMS = List.of(
            new PlatformInfo("weibo", "weibo", "微博热搜"),
            new PlatformInfo("zhihu", "zhihu", "知乎热榜"),
            new PlatformInfo("toutiao", "toutiao", "今日头条"),
            new PlatformInfo("bilibili", "bilibili", "B站热搜"),
            new PlatformInfo("baidu", "baidu", "百度热搜"),
            new PlatformInfo("douyin", "douyin", "抖音热点"),
            new PlatformInfo("36kr", "36kr", "36氪"),
            new PlatformInfo("itHome", "ithome", "IT之家"),
            new PlatformInfo("thepaper", "thepaper", "澎湃新闻"),
            new PlatformInfo("newsqq", "newsqq", "腾讯新闻")
    );

    private static final List<CategoryRule> CATEGORY_RULES = categoryRules();

    private static final Pattern SCRIPT = Pattern.compile("<script[\\s\\S]*?</script>", Pattern.CASE_INSENSITIVE);
    private static final Pattern STYLE = Pattern.compile("<style[\\s\\S]*?</style>", Pattern.CASE_INSENSITIVE);
    private static final Pattern HEAD = Pattern.compile("<head[\\s\\S]*?</head>", Pattern.CASE_INSENSITIVE);
    private static final Pattern NAV = Pattern.compile("<nav[\\s\\S]*?</nav>", Pattern.CASE_INSENSITIVE);
    private static final Pattern HEADER = Pattern.compile("<header[\\s\\S]*?</header>", Pattern.CASE_INSENSITIVE);
    private static final Pattern FOOTER = Pattern.compile("<footer[\\s\\S]*?</footer>", Pattern.CASE_INSENSITIVE);
    private static final Pattern ASIDE = Pattern.compile("<aside[\\s\\S]*?</aside>", Pattern.CASE_INSENSITIVE);
    private static final Pattern IFRAME = Pattern.compile("<iframe[\\s\\S]*?</iframe>", Pattern.CASE_INSENSITIVE);
    private static final Pattern TITLE_TAG = Pattern.compile("<title[^>]*>([\\s\\S]*?)</title>", Pattern.CASE_INSENSITIVE);
    private static final Pattern ARTICLE_TAG = Pattern.compile("<article[^>]*>([\\s\\S]*?)</article>", Pattern.CASE_INSENSITIVE);
    private static final Pattern DIV_TAG = Pattern.compile("<div[^>]*>([\\s\\S]*?)</div>", Pattern.CASE_INSENSITIVE);
    private static final Pattern P_COUNT = Pattern.compile("<p\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern PARAGRAPH_OR_HEADING =
            Pattern.compile("<p[^>]*>([\\s\\S]*?)</p>|<h([1-6])[^>]*>([\\s\\S]*?)</h\\2>", Pattern.CASE_INSENSITIVE);
    private static final Pattern AD_LINE = Pattern.compile(
            "^(版权|免责声明|来源|编辑|转载|原标题|作者|Copyright|©|上一篇|下一篇|推荐阅读|相关推荐|点击.*看|关注.*公众号)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern TAGS = Pattern.compile("<[^>]+>");
    private static final Pattern CHARSET_PARAM = Pattern.compile("charset=([\\w-]+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern WHITESPACE_RUN = Pattern.compile("\\s+");
    private static final Pattern NEWLINE_RUN = Pattern.compile("[\\r\\n\\t]+");

    private final ObjectMapper objectMapper;
    private final String baseUrl;
    private final java.net.http.HttpClient httpClient;

    public AiHotService(ObjectMapper objectMapper, Environment environment) {
        this.objectMapper = objectMapper;
        String configured = environment.getProperty("DAILY_HOT_API_BASE");
        this.baseUrl = configured == null || configured.isEmpty() ? "https://hot.banned.icu/api" : configured;
        this.httpClient = java.net.http.HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .followRedirects(java.net.http.HttpClient.Redirect.NORMAL)
                .build();
    }

    // ==================== GET /api/ai/hot/platforms ====================

    public Map<String, Object> platforms() {
        List<Map<String, Object>> list = new ArrayList<>();
        for (PlatformInfo platform : PLATFORMS) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("key", platform.displayKey());
            item.put("name", platform.fullName());
            list.add(item);
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("data", list);
        return body;
    }

    // ==================== GET /api/ai/hot ====================

    public Map<String, Object> hot(String platformParam) {
        String platform = platformParam == null || platformParam.isEmpty() ? "weibo" : platformParam;
        PlatformInfo info = find(platform);
        if (info == null) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("success", false);
            body.put("error", "不支持的平台: " + platform);
            throw new ApiException(400, "不支持的平台: " + platform, body);
        }
        List<Map<String, Object>> list = fetchPlatform(info);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("data", list);
        body.put("platform", platform);
        body.put("fetchedAt", System.currentTimeMillis());
        return body;
    }

    // ==================== GET /api/ai/hot/batch ====================

    public Map<String, Object> hotBatch(String platformsParam) {
        String raw = platformsParam == null || platformsParam.isEmpty() ? "weibo,zhihu,toutiao" : platformsParam;
        List<String> requested = new ArrayList<>();
        for (String part : raw.split(",", -1)) {
            String trimmed = JsStrings.trim(part);
            if (!trimmed.isEmpty()) {
                requested.add(trimmed);
            }
        }

        Map<String, Map<String, Object>> data = new LinkedHashMap<>();
        for (String platform : requested) {
            PlatformInfo info = find(platform);
            if (info == null) {
                continue;
            }
            Map<String, Object> entry = new LinkedHashMap<>();
            try {
                entry.put("list", fetchPlatform(info));
                entry.put("error", null);
            } catch (Exception error) {
                entry.put("list", new ArrayList<>());
                entry.put("error", error.getMessage() == null ? String.valueOf(error) : error.getMessage());
            }
            data.put(platform, entry);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("data", data);
        body.put("fetchedAt", System.currentTimeMillis());
        return body;
    }

    // ==================== GET /api/ai/article-parse ====================

    public Map<String, Object> articleParse(String rawUrl) {
        String url = JsStrings.trim(rawUrl == null ? "" : rawUrl);
        if (url.isEmpty()) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("success", false);
            body.put("error", "缺少 url 参数");
            throw new ApiException(400, "缺少 url 参数", body);
        }
        if (!Pattern.compile("^https?://", Pattern.CASE_INSENSITIVE).matcher(url).find()) {
            url = "https://" + url;
        }

        byte[] bytes;
        String contentType;
        try {
            java.net.http.HttpRequest request = java.net.http.HttpRequest.newBuilder(java.net.URI.create(url))
                    .timeout(Duration.ofSeconds(15))
                    .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36")
                    .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                    .header("Accept-Language", "zh-CN,zh;q=0.9")
                    .GET()
                    .build();
            var response = httpClient.send(request, java.net.http.HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("HTTP " + response.statusCode());
            }
            bytes = response.body();
            contentType = response.headers().firstValue("content-type").orElse("");
        } catch (IllegalStateException httpError) {
            throw httpError;
        } catch (Exception error) {
            throw new IllegalStateException(error.getMessage() == null ? String.valueOf(error) : error.getMessage());
        }

        String charset = "utf-8";
        Matcher charsetMatch = CHARSET_PARAM.matcher(contentType);
        if (charsetMatch.find()) {
            charset = charsetMatch.group(1);
        }
        String html = decode(bytes, charset);

        html = SCRIPT.matcher(html).replaceAll("");
        html = STYLE.matcher(html).replaceAll("");
        html = HEAD.matcher(html).replaceAll("");
        html = NAV.matcher(html).replaceAll("");
        html = HEADER.matcher(html).replaceAll("");
        html = FOOTER.matcher(html).replaceAll("");
        html = ASIDE.matcher(html).replaceAll("");
        html = IFRAME.matcher(html).replaceAll("");

        Matcher titleMatch = TITLE_TAG.matcher(html);
        String title = titleMatch.find() ? JsStrings.trim(NEWLINE_RUN.matcher(titleMatch.group(1)).replaceAll(" ")) : "";

        String articleHtml = "";
        Matcher articleMatch = ARTICLE_TAG.matcher(html);
        if (articleMatch.find()) {
            articleHtml = articleMatch.group(1);
        } else {
            String best = "";
            Matcher divs = DIV_TAG.matcher(html);
            while (divs.find()) {
                String inner = divs.group(1);
                int pCount = 0;
                Matcher pMatcher = P_COUNT.matcher(inner);
                while (pMatcher.find()) {
                    pCount++;
                }
                if (pCount >= 3 && inner.length() > best.length()) {
                    best = inner;
                }
            }
            articleHtml = best;
        }

        List<Map<String, Object>> blocks = new ArrayList<>();
        Matcher matcher = PARAGRAPH_OR_HEADING.matcher(articleHtml);
        while (matcher.find()) {
            Map<String, Object> block = new LinkedHashMap<>();
            if (matcher.group(1) != null) {
                block.put("type", "p");
                block.put("text", JsStrings.trim(WHITESPACE_RUN.matcher(stripTags(matcher.group(1))).replaceAll(" ")));
            } else {
                block.put("type", "h" + matcher.group(2));
                block.put("text", JsStrings.trim(WHITESPACE_RUN.matcher(stripTags(matcher.group(3))).replaceAll(" ")));
            }
            blocks.add(block);
        }

        List<Map<String, Object>> paragraphs = new ArrayList<>();
        for (Map<String, Object> block : blocks) {
            String text = String.valueOf(block.get("text"));
            if (text.isEmpty()) {
                continue;
            }
            if (AD_LINE.matcher(text).find()) {
                continue;
            }
            if (text.length() < 5) {
                continue;
            }
            paragraphs.add(block);
        }

        StringBuilder plainText = new StringBuilder();
        for (Map<String, Object> paragraph : paragraphs) {
            if (plainText.length() > 0) {
                plainText.append("\n\n");
            }
            plainText.append(String.valueOf(paragraph.get("text")));
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("url", url);
        body.put("title", title);
        body.put("wordCount", plainText.length());
        body.put("paragraphCount", paragraphs.size());
        body.put("paragraphs", paragraphs);
        body.put("plainText", plainText.toString());
        body.put("riskNotice", "⚠️ 本接口仅用于结构分析/选题参考。直接搬运全文用于发布，存在著作权侵权风险。");
        return body;
    }

    // ==================== 内部实现 ====================

    private static PlatformInfo find(String propertyName) {
        for (PlatformInfo info : PLATFORMS) {
            if (info.propertyName().equals(propertyName)) {
                return info;
            }
        }
        return null;
    }

    private List<Map<String, Object>> fetchPlatform(PlatformInfo info) {
        String requestUrl = baseUrl + "/" + info.propertyName();
        byte[] bytes;
        try {
            java.net.http.HttpRequest request = java.net.http.HttpRequest.newBuilder(java.net.URI.create(requestUrl))
                    .timeout(Duration.ofSeconds(8))
                    .header("User-Agent", "StockWorkbench/1.0")
                    .GET()
                    .build();
            var response = httpClient.send(request, java.net.http.HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("HTTP " + response.statusCode());
            }
            bytes = response.body();
        } catch (IllegalStateException httpError) {
            throw httpError;
        } catch (Exception error) {
            throw new IllegalStateException(error.getMessage() == null ? String.valueOf(error) : error.getMessage());
        }

        Object parsed;
        try {
            parsed = objectMapper.readValue(bytes, Object.class);
        } catch (Exception error) {
            throw new IllegalStateException(error.getMessage() == null ? String.valueOf(error) : error.getMessage());
        }
        List<?> rows = new ArrayList<>();
        if (parsed instanceof Map<?, ?> map && map.get("data") instanceof List<?> list) {
            rows = list;
        }

        List<Map<String, Object>> items = new ArrayList<>();
        for (int i = 0; i < rows.size(); i++) {
            if (!(rows.get(i) instanceof Map<?, ?> row)) {
                continue;
            }
            String rawTitle = row.get("title") == null ? "" : JsValues.toJsString(row.get("title"));
            String itemTitle = JsStrings.trim(rawTitle);
            if (itemTitle.isEmpty()) {
                continue;
            }
            Object rank = row.get("rank");
            Object hot = row.get("hot");
            String url = JsValues.truthy(row.get("url"))
                    ? JsValues.toJsString(row.get("url"))
                    : (JsValues.truthy(row.get("mobileUrl")) ? JsValues.toJsString(row.get("mobileUrl")) : "");
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("rank", rank == null ? i + 1 : rank);
            item.put("title", itemTitle);
            item.put("url", url);
            item.put("hot", hot == null ? null : hot);
            item.put("source", info.fullName());
            item.put("category", categorizeTitle(rawTitle));
            item.put("createdAt", System.currentTimeMillis());
            items.add(item);
        }
        return items;
    }

    static String categorizeTitle(String title) {
        for (CategoryRule rule : CATEGORY_RULES) {
            for (String keyword : rule.keywords()) {
                if (title.contains(keyword)) {
                    return rule.category();
                }
            }
        }
        return "综合";
    }

    /** 对齐 Node 端 stripTags。 */
    private static String stripTags(String value) {
        String result = TAGS.matcher(value == null ? "" : value).replaceAll("");
        return result.replace("&nbsp;", " ")
                .replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"")
                .replace("&#39;", "'");
    }

    private static String decode(byte[] bytes, String charsetName) {
        String normalized = charsetName.toLowerCase(Locale.ROOT);
        if (normalized.startsWith("utf-8") || normalized.equals("utf8")) {
            return Utf8Js.decode(bytes);
        }
        try {
            Charset charset = switch (normalized) {
                case "gbk", "gb2312", "gb18030", "gb-2312", "x-gbk" -> Charset.forName("GB18030");
                case "big5", "big-5" -> Charset.forName("Big5");
                default -> Charset.forName(charsetName);
            };
            return new String(bytes, charset);
        } catch (Exception ignored) {
            return Utf8Js.decode(bytes);
        }
    }

    private record PlatformInfo(String propertyName, String displayKey, String fullName) {
    }

    private record CategoryRule(String category, List<String> keywords) {
    }

    private static List<CategoryRule> categoryRules() {
        return List.of(
                new CategoryRule("科技", List.of("芯片", "AI", "人工智能", "大模型", "GPT", "AI", "苹果", "华为", "小米", "OPPO", "手机", "特斯拉", "新能源", "电动车", "电动汽车", "互联网", "腾讯", "阿里", "字节", "百度", "元宇宙", "VR", "AR", "机器人", "半导体", "光刻机", "5G", "卫星")),
                new CategoryRule("财经", List.of("股票", "A股", "大盘", "沪指", "深成指", "创业板", "基金", "理财", "央行", "利率", "降息", "加息", "楼市", "房价", "房产", "地产", "GDP", "通胀", "CPI", "汇率", "人民币", "美元", "黄金", "原油", "油价", "上市公司", "业绩", "财报", "IPO", "融资")),
                new CategoryRule("社会", List.of("车祸", "事故", "救援", "火灾", "暴雨", "地震", "台风", "灾害", "坠亡", "跳楼", "溺水", "失联", "抓获", "抓获", "通报", "警方", "公安", "法院", "判决", "案件", "报警", "城管", "学校", "校园", "家长", "老师", "学生", "医院", "医生", "医疗")),
                new CategoryRule("娱乐", List.of("明星", "艺人", "歌手", "演员", "演唱会", "电影", "票房", "综艺", "节目", "剧集", "电视剧", "CP", "粉丝", "热搜", "娱乐", "八卦", "爆料", "博主", "网红", "主播", "直播", "游戏", "电竞", "LPL", "Uzi", "S赛")),
                new CategoryRule("体育", List.of("CBA", "NBA", "国足", "中超", "亚冠", "欧冠", "英超", "西甲", "意甲", "德甲", "世界杯", "奥运会", "亚运会", "马拉松", "梅西", "C罗", "詹姆斯", "库里", "足球", "篮球", "排球", "比赛", "冠军", "亚军", "决赛", "半决赛", "教练", "裁判")),
                new CategoryRule("时政", List.of("国务院", "总书记", "主席", "总理", "部长", "省委", "市委", "外交部", "国防部", "发布会", "台湾", "香港", "澳门", "中美", "中俄", "北约", "欧盟", "联合国", "普京", "拜登", "特朗普", "马克龙", "政策", "通知", "规定"))
        );
    }
}
