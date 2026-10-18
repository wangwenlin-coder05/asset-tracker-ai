package com.wangwenlin.stock.service;

import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.common.JsStrings;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 看图分析（K 线形态 + 指标）→ 信号 + 操作意见 —— 对齐 Node 端 server.js 中 /api/ai/charts。
 * 指标算法与阈值判定逐行对齐，文案（含 toFixed 小数位）也保持一致。
 */
@Service
public class AiChartService {

    private final MarketDataService marketDataService;

    public AiChartService(MarketDataService marketDataService) {
        this.marketDataService = marketDataService;
    }

    public Map<String, Object> charts(String codeParam) {
        String code = JsStrings.trim(codeParam == null ? "" : codeParam);
        if (code.isEmpty()) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("ok", false);
            body.put("error", "缺少股票代码");
            return body;
        }

        List<Map<String, Object>> bars;
        try {
            bars = marketDataService.stockDailyHistory(code, 90);
        } catch (Exception error) {
            bars = new ArrayList<>();
        }
        if (bars.size() < 30) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("ok", false);
            body.put("error", "本地无 " + code + " 足够行情（需 ≥30 根日 K）");
            return body;
        }

        List<Double> closes = new ArrayList<>();
        List<Double> highs = new ArrayList<>();
        List<Double> lows = new ArrayList<>();
        List<Double> vols = new ArrayList<>();
        for (Map<String, Object> bar : bars) {
            closes.add(num(bar.get("close")));
            highs.add(num(bar.get("high")));
            lows.add(num(bar.get("low")));
            Double volume = num(bar.get("volume"));
            vols.add(volume == null || volume.isNaN() ? 0d : volume);
        }

        int lastIndex = closes.size() - 1;
        double price = closes.get(lastIndex);
        Double ma5 = ma(closes, 5, lastIndex);
        Double ma10 = ma(closes, 10, lastIndex);
        Double ma20 = ma(closes, 20, lastIndex);
        Double ma60 = ma(closes, 60, lastIndex);
        double rsi = r14(closes);
        Macd macd = macd(closes);
        double dif = orZero(macd.dif.get(macd.dif.size() - 1));
        double dea = orZero(macd.dea.get(macd.dea.size() - 1));
        double prevDif = macd.dif.size() >= 2 ? orZero(macd.dif.get(macd.dif.size() - 2)) : dif;
        double prevDea = macd.dea.size() >= 2 ? orZero(macd.dea.get(macd.dea.size() - 2)) : dea;
        Boll boll = boll(closes);
        double recentHigh = maxOf(highs.subList(Math.max(0, highs.size() - 20), highs.size()));
        double recentLow = minOf(lows.subList(Math.max(0, lows.size() - 20), lows.size()));
        Double trendBaseValue = sliceFirst(closes, closes.size() - 21, closes.size() - 1);
        double trendBase = trendBaseValue == null ? price : trendBaseValue;
        double trendPct = trendBase > 0
                ? numOf(toFixed(((price - trendBase) / trendBase) * 100, 2))
                : 0;

        List<Double> volWindow = new ArrayList<>(vols.subList(Math.max(0, vols.size() - 21), Math.max(0, vols.size() - 1)));
        double volSum = 0;
        for (Double value : volWindow) {
            volSum += value;
        }
        double volAvg = volSum / Math.max(1, Math.min(20, vols.size() - 1));
        double volRatio = volAvg > 0 ? numOf(toFixed(vols.get(vols.size() - 1) / volAvg, 2)) : 1;

        List<Map<String, Object>> signals = new ArrayList<>();
        int[] score = {0};

        boolean maAlign = ma5 != null && ma20 != null && ma5 > ma20;
        if (maAlign) {
            add(signals, score, "均线多头排列",
                    "MA5(" + toFixed(ma5, 2) + ") > MA10(" + (ma10 == null ? "undefined" : toFixed(ma10, 2))
                            + ") > MA20(" + toFixed(ma20, 2) + ")，短期趋势向上", 2, "ma");
        } else if (ma5 != null && ma20 != null && ma5 < ma20) {
            add(signals, score, "均线空头排列", "MA5 下穿 MA20，短期趋势偏弱", -2, "ma");
        }

        // 注意：此处刻意复刻 Node 的既有行为 —— server.js 里写的是 Math.min(lows.slice(-10))
        // 与 Math.max(highs.slice(-10))，把数组当标量传入，结果恒为 NaN。
        // 迁移期要求两侧逐字节一致，故这里同样用 NaN，直到 Node 侧修好再一起放开。
        double sup = Double.NaN;
        double resistance = Double.NaN;
        boolean upperBand = price > (sup + resistance) / 2;
        add(signals, score, "支撑与压力",
                "近 10 日支撑 ¥" + toFixed(sup, 2) + " / 压力 ¥" + toFixed(resistance, 2)
                        + "，现价 " + (upperBand ? "偏上轨" : "偏下轨"),
                upperBand ? 1 : -1, "level");

        if (rsi >= 70) {
            add(signals, score, "RSI 超买", "RSI14 = " + toFixed(rsi, 1) + " ≥ 70，短线过热", -2, "kdj");
        } else if (rsi <= 30) {
            add(signals, score, "RSI 超卖", "RSI14 = " + toFixed(rsi, 1) + " ≤ 30，短线超跌", 2, "kdj");
        }

        if (prevDif <= prevDea && dif > dea) {
            add(signals, score, "MACD 金叉",
                    "DIF(" + toFixed(dif, 2) + ") 上穿 DEA(" + toFixed(dea, 2) + ")，动能转多", 2, "macd");
        } else if (prevDif >= prevDea && dif < dea) {
            add(signals, score, "MACD 死叉", "DIF 下穿 DEA，动能转弱", -2, "macd");
        } else if (dif > dea) {
            add(signals, score, "MACD 多头", "DIF 持续位于 DEA 上方", 1, "macd");
        } else {
            add(signals, score, "MACD 空头", "DIF 位于 DEA 下方", -1, "macd");
        }

        if (volRatio > 1.5) {
            boolean aboveMa5 = ma5 != null && price > ma5;
            add(signals, score, "放量", "量比 " + jsNumber(volRatio) + "（>1.5），关注是否有效突破/跌破",
                    aboveMa5 ? 1 : -1, "volume");
        } else if (volRatio < 0.6) {
            add(signals, score, "缩量", "量比 " + jsNumber(volRatio) + "（<0.6），观望情绪浓", 0, "volume");
        }

        if (boll != null) {
            if (price <= boll.dn) {
                add(signals, score, "触及布林下轨",
                        "现价 ¥" + toFixed(price, 2) + " ≤ 下轨 ¥" + toFixed(boll.dn, 2) + "，短线超跌", 1, "boll");
            } else if (price >= boll.up) {
                add(signals, score, "触及布林上轨",
                        "现价 ¥" + toFixed(price, 2) + " ≥ 上轨 ¥" + toFixed(boll.up, 2) + "，短线超涨", -1, "boll");
            }
        }

        add(signals, score, "近 20 日高低",
                "区间 ¥" + toFixed(recentLow, 2) + " – ¥" + toFixed(recentHigh, 2)
                        + "，现价距高点 " + toFixed(((price - recentHigh) / recentHigh) * 100, 1) + "%",
                0, "swing");

        add(signals, score, "近 20 日趋势",
                trendPct >= 0
                        ? "区间 " + (trendPct >= 0 ? "+" : "") + jsNumber(trendPct) + "%，趋势偏多"
                        : "区间 " + jsNumber(trendPct) + "%，趋势偏空",
                trendPct >= 0 ? 1 : -1, "trend");

        String advice;
        String adviceClass;
        if (score[0] >= 5) {
            advice = "建议：偏多。趋势与动能共振，可考虑逢低加仓 / 持有，止盈位参考布林上轨。";
            adviceClass = "bull";
        } else if (score[0] >= 2) {
            advice = "建议：偏多观望。多头信号占优，但尚未形成共振，可持有观察放量确认。";
            adviceClass = "bull";
        } else if (score[0] <= -5) {
            advice = "建议：偏空。空头信号共振，可考虑逢高减仓 / 落袋，止损位参考布林下轨。";
            adviceClass = "bear";
        } else if (score[0] <= -2) {
            advice = "建议：偏空观望。空头信号占优，等待止跌信号再行动。";
            adviceClass = "bear";
        } else {
            advice = "建议：震荡观望。多空信号交织，等待方向选择，可围绕支撑/压力高抛低吸。";
            adviceClass = "neutral";
        }

        Map<String, Object> metrics = new LinkedHashMap<>();
        metrics.put("price", numOf(toFixed(price, 3)));
        metrics.put("ma5", ma5 == null ? null : numOf(toFixed(ma5, 3)));
        metrics.put("ma10", ma10 == null ? null : numOf(toFixed(ma10, 3)));
        metrics.put("ma20", ma20 == null ? null : numOf(toFixed(ma20, 3)));
        metrics.put("ma60", ma60 == null ? null : numOf(toFixed(ma60, 3)));
        metrics.put("rsi", numOf(toFixed(rsi == 0 ? 50 : rsi, 1)));
        metrics.put("dif", numOf(toFixed(dif, 3)));
        metrics.put("dea", numOf(toFixed(dea, 3)));
        metrics.put("volRatio", volRatio);
        metrics.put("trendPct", trendPct);

        List<Map<String, Object>> candles = new ArrayList<>();
        int from = Math.max(0, bars.size() - 60);
        for (int i = from; i < bars.size(); i++) {
            Map<String, Object> bar = bars.get(i);
            Map<String, Object> candle = new LinkedHashMap<>();
            candle.put("date", bar.get("date"));
            candle.put("o", bar.get("open"));
            candle.put("c", bar.get("close"));
            candle.put("h", bar.get("high"));
            candle.put("l", bar.get("low"));
            candles.add(candle);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("code", code);
        result.put("fetchedAt", System.currentTimeMillis());
        result.put("metrics", metrics);
        result.put("signals", signals);
        result.put("advice", advice);
        result.put("adviceClass", adviceClass);
        result.put("candles", candles);
        return result;
    }

    // ==================== 指标 ====================

    private static Double ma(List<Double> arr, int n, int i) {
        if (i + 1 < n) {
            return null;
        }
        double sum = 0;
        for (int j = i - n + 1; j <= i; j++) {
            sum += arr.get(j);
        }
        return sum / n;
    }

    private static List<Double> emaSeries(List<Double> arr, int n) {
        double k = 2.0 / (n + 1);
        List<Double> out = new ArrayList<>();
        double prev = arr.get(0);
        for (int i = 0; i < arr.size(); i++) {
            prev = i == 0 ? arr.get(0) : arr.get(i) * k + prev * (1 - k);
            out.add(prev);
        }
        return out;
    }

    private static double r14(List<Double> closes) {
        double gain = 0;
        double loss = 0;
        for (int i = closes.size() - 14; i < closes.size(); i++) {
            double d = closes.get(i) - closes.get(i - 1);
            if (d > 0) {
                gain += d;
            } else {
                loss -= d;
            }
        }
        return loss == 0 ? 100 : 100 - 100 / (1 + gain / loss);
    }

    private record Macd(List<Double> dif, List<Double> dea) {
    }

    private static Macd macd(List<Double> closes) {
        List<Double> e12 = emaSeries(closes, 12);
        List<Double> e26 = emaSeries(closes, 26);
        List<Double> dif = new ArrayList<>();
        for (int i = 0; i < e12.size(); i++) {
            dif.add(e12.get(i) - e26.get(i));
        }
        List<Double> dea = emaSeries(dif, 9);
        return new Macd(dif, dea);
    }

    private record Boll(double mid, double up, double dn, double price) {
    }

    private static Boll boll(List<Double> closes) {
        int n = 20;
        int i = closes.size() - 1;
        if (i + 1 < n) {
            return null;
        }
        List<Double> slice = closes.subList(i - n + 1, i + 1);
        double mid = 0;
        for (Double value : slice) {
            mid += value;
        }
        mid /= n;
        double variance = 0;
        for (Double value : slice) {
            variance += Math.pow(value - mid, 2);
        }
        double sd = Math.sqrt(variance / n);
        return new Boll(mid, mid + 2 * sd, mid - 2 * sd, closes.get(i));
    }

    // ==================== 工具 ====================

    private static void add(List<Map<String, Object>> signals, int[] score, String title, String detail, int s, String group) {
        score[0] += s;
        Map<String, Object> signal = new LinkedHashMap<>();
        signal.put("id", signals.size() + 1);
        signal.put("group", group);
        signal.put("title", title);
        signal.put("detail", detail);
        signal.put("score", s);
        signals.add(signal);
    }

    /**
     * 等价 JS {@code value.toFixed(digits)}。
     * 关键差异：Java 的 {@code String.format("%.3f")} 会先取「最短可回读十进制」再四舍五入，
     * 而 JS 是按 double 的精确二进制值取整（例如 1267.51549999999997453 → JS 得 1267.515、
     * String.format 得 1267.516）。这里改用 {@code new BigDecimal(value)} 取精确值再定标。
     */
    static String toFixed(double value, int digits) {
        if (Double.isNaN(value) || Double.isInfinite(value)) {
            return String.valueOf(value);
        }
        return new java.math.BigDecimal(value)
                .setScale(digits, java.math.RoundingMode.HALF_UP)
                .toPlainString();
    }

    /** 等价 JS 把 number 拼进模板字符串的输出。 */
    static String jsNumber(double value) {
        if (value == Math.rint(value) && Math.abs(value) < 1e21) {
            return String.valueOf((long) value);
        }
        return String.valueOf(value);
    }

    private static double numOf(String text) {
        try {
            return Double.parseDouble(text);
        } catch (NumberFormatException error) {
            return Double.NaN;
        }
    }

    private static Double num(Object value) {
        return MarketDataService.number(value);
    }

    private static double orZero(Double value) {
        return value == null || value.isNaN() ? 0 : value;
    }

    private static double maxOf(List<Double> values) {
        double result = Double.NEGATIVE_INFINITY;
        for (Double value : values) {
            result = Math.max(result, value);
        }
        return result;
    }

    private static double minOf(List<Double> values) {
        double result = Double.POSITIVE_INFINITY;
        for (Double value : values) {
            result = Math.min(result, value);
        }
        return result;
    }

    /** 等价 {@code arr.slice(start, end)[0]}（越界返回 null）。 */
    private static Double sliceFirst(List<Double> arr, int start, int end) {
        int length = arr.size();
        int from = start < 0 ? Math.max(0, length + start) : Math.min(start, length);
        int to = end < 0 ? Math.max(0, length + end) : Math.min(end, length);
        if (from >= to) {
            return null;
        }
        return arr.get(from);
    }
}
