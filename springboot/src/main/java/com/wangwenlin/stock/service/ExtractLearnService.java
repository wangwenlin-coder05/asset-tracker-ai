package com.wangwenlin.stock.service;

import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.common.JsStrings;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.mapper.WechatCategoryMapper;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 用户纠正记忆（extract_learn）的查询与写入，对齐 server.js 的 GET / POST /api/extract/learn。
 */
@Service
public class ExtractLearnService {

    private static final List<String> LABELS = List.of("marketing", "stock_pick", "market_news");
    private static final Pattern PURE_SIX = Pattern.compile("^\\d{6}$");

    private final WechatCategoryMapper mapper;

    public ExtractLearnService(WechatCategoryMapper mapper) {
        this.mapper = mapper;
    }

    /** 命中记忆返回记录列表（键序为 SELECT 列序），无命中返回 null（等价 Node 端 res.json(null)）。 */
    public List<Map<String, Object>> learn(String qParam) {
        String q = JsStrings.trim(qParam == null ? "" : qParam);
        if (q.isEmpty()) {
            throw new ApiException(400, "缺少 q 参数");
        }
        List<LinkedHashMap<String, Object>> rows = mapper.listExtractLearn(q);
        return rows.isEmpty() ? null : new java.util.ArrayList<Map<String, Object>>(rows);
    }

    public Map<String, Object> save(Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        Object sourceTextRaw = b.containsKey("source_text") ? b.get("source_text") : "";
        Object wrongLabelRaw = b.containsKey("wrong_label") ? b.get("wrong_label") : "";
        Object correctLabelRaw = b.containsKey("correct_label") ? b.get("correct_label") : "";
        Object wrongCodeRaw = b.containsKey("wrong_code") ? b.get("wrong_code") : "";
        Object correctCodeRaw = b.containsKey("correct_code") ? b.get("correct_code") : "";

        if (!JsValues.truthy(sourceTextRaw) || !(sourceTextRaw instanceof String)) {
            throw new ApiException(400, "source_text 不能为空");
        }
        if (!(correctLabelRaw instanceof String correctLabel) || !LABELS.contains(correctLabel)) {
            throw new ApiException(400, "correct_label 无效，可选：marketing / stock_pick / market_news");
        }

        String source = JsValues.toJsString(sourceTextRaw);
        String src = source.length() > 500 ? source.substring(0, 500) : source;
        String wrongLabel = JsValues.truthy(wrongLabelRaw) && LABELS.contains(JsValues.toJsString(wrongLabelRaw))
                ? JsValues.toJsString(wrongLabelRaw) : null;
        String correctCode = sixDigits(correctCodeRaw);
        String wrongCode = sixDigits(wrongCodeRaw);
        long now = System.currentTimeMillis();

        List<LinkedHashMap<String, Object>> rows = mapper.findExtractLearnBySource(src);
        if (!rows.isEmpty()) {
            Object id = rows.get(0).get("id");
            Object hitCount = rows.get(0).get("hit_count");
            mapper.updateExtractLearn(correctLabel, correctCode, wrongLabel, wrongCode, now, asInteger(id));
            mapper.bumpExtractLearnHit(asInteger(id));
            long next = (hitCount instanceof Number number ? number.longValue() : 0L) + 1L;
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("ok", true);
            result.put("learned", false);
            result.put("hit_count", next);
            return result;
        }

        mapper.insertExtractLearn(src, wrongLabel, correctLabel, wrongCode, correctCode, now);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("learned", true);
        result.put("hit_count", 1);
        return result;
    }

    private static String sixDigits(Object value) {
        String text = JsStrings.trim(JsValues.truthy(value) ? JsValues.toJsString(value) : "");
        return PURE_SIX.matcher(text).matches() ? text : null;
    }

    private static Integer asInteger(Object value) {
        return value instanceof Number number ? number.intValue() : null;
    }
}
