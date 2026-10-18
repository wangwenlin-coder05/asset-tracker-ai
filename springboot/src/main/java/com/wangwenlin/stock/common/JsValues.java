package com.wangwenlin.stock.common;

/**
 * 对齐 JS 的取值语义：Number(v) / 真值判断，保证与 Node 端校验分支完全一致。
 */
public final class JsValues {

    private JsValues() {
    }

    /**
     * 等价于 {@code Number.isFinite(Number(value)) ? Number(value) : null}。
     * null → 0（Number(null) === 0）；'' → 0；非数字字符串 → null。
     */
    public static Double parse(Object value) {
        if (value == null) {
            return 0d;
        }
        if (value instanceof Boolean bool) {
            return bool ? 1d : 0d;
        }
        if (value instanceof Number number) {
            double result = number.doubleValue();
            return Double.isFinite(result) ? result : null;
        }
        if (value instanceof String text) {
            String trimmed = text.trim();
            if (trimmed.isEmpty()) {
                return 0d;
            }
            try {
                double result = Double.parseDouble(trimmed);
                return Double.isFinite(result) ? result : null;
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    public static double parseOrZero(Object value) {
        Double parsed = parse(value);
        return parsed == null ? 0d : parsed;
    }

    /** 等价于 JS 真值判断：null / 0 / NaN / '' / false 为假。 */
    public static boolean truthy(Object value) {
        if (value == null) {
            return false;
        }
        if (value instanceof Boolean bool) {
            return bool;
        }
        if (value instanceof Number number) {
            double result = number.doubleValue();
            return result != 0d && !Double.isNaN(result);
        }
        if (value instanceof String text) {
            return !text.isEmpty();
        }
        return true;
    }

    /** 等价于 {@code value || ''}：保留原值类型（数字仍是数字），假值一律返回空串。 */
    public static Object orEmptyValue(Object value) {
        return truthy(value) ? value : "";
    }

    /** 等价于 {@code value || null}。 */
    public static Object truthyOrNull(Object value) {
        return truthy(value) ? value : null;
    }

    /** 等价于 {@code value || ''}。 */
    public static String orEmpty(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    /** 等价于 {@code value || fallback}。 */
    public static String orDefault(Object value, String fallback) {
        return truthy(value) ? String.valueOf(value) : fallback;
    }

    /**
     * 等价 JS 的 {@code parseInt(value)}（无 radix，按十进制）：
     * 跳过前置空白与可选正负号，读取连续数字，遇到非法字符即停止；无数字则返回 null（等价 NaN）。
     */
    public static Long parseIntOrNull(String value) {
        if (value == null || value.isEmpty()) {
            return null;
        }
        int i = 0;
        int length = value.length();
        while (i < length && isParseIntWhitespace(value.charAt(i))) {
            i++;
        }
        int sign = 1;
        if (i < length && (value.charAt(i) == '+' || value.charAt(i) == '-')) {
            if (value.charAt(i) == '-') {
                sign = -1;
            }
            i++;
        }
        int start = i;
        while (i < length && value.charAt(i) >= '0' && value.charAt(i) <= '9') {
            i++;
        }
        if (i == start) {
            return null;
        }
        try {
            return sign * Long.parseLong(value.substring(start, i));
        } catch (NumberFormatException overflow) {
            // JS 会先按 double 收敛，超大数值这里退化为 double 再取整
            double parsed = Double.parseDouble(value.substring(start, i));
            return (long) (sign * parsed);
        }
    }

    /**
     * 等价 JS 的 {@code parseFloat(value)}：跳过前置空白，读取最长合法数字前缀；
     * 读不到任何数字返回 null（等价 NaN）。支持 {@code Infinity}。
     */
    public static Double parseFloat(Object value) {
        if (value == null) {
            return null;
        }
        return parseFloatText(toJsString(value));
    }

    private static Double parseFloatText(String text) {
        int index = 0;
        int length = text.length();
        while (index < length && isParseIntWhitespace(text.charAt(index))) {
            index++;
        }
        if (index >= length) {
            return null;
        }
        // 数字字面量从符号位开始，整段（含符号）交给 Double.parseDouble
        int numberStart = index;
        if (text.charAt(index) == '+' || text.charAt(index) == '-') {
            index++;
        }
        if (text.startsWith("Infinity", index)) {
            return text.charAt(numberStart) == '-' ? Double.NEGATIVE_INFINITY : Double.POSITIVE_INFINITY;
        }
        int digitsStart = index;
        while (index < length && isDigit(text.charAt(index))) {
            index++;
        }
        int intDigits = index - digitsStart;
        int fractionDigits = 0;
        if (index < length && text.charAt(index) == '.') {
            index++;
            int fractionStart = index;
            while (index < length && isDigit(text.charAt(index))) {
                index++;
            }
            fractionDigits = index - fractionStart;
        }
        if (intDigits == 0 && fractionDigits == 0) {
            return null;
        }
        // 指数部分必须形如 e[+-]digits；不合法时 parseFloat 停在已读到的数字处
        int end = index;
        if (index < length && (text.charAt(index) == 'e' || text.charAt(index) == 'E')) {
            int probe = index + 1;
            if (probe < length && (text.charAt(probe) == '+' || text.charAt(probe) == '-')) {
                probe++;
            }
            int exponentStart = probe;
            while (probe < length && isDigit(text.charAt(probe))) {
                probe++;
            }
            if (probe > exponentStart) {
                end = probe;
            }
        }
        try {
            return Double.parseDouble(text.substring(numberStart, end));
        } catch (NumberFormatException ignored) {
            // 极长数字溢出：JS 的 parseFloat 会收敛到 Infinity
            return text.charAt(numberStart) == '-' ? Double.NEGATIVE_INFINITY : Double.POSITIVE_INFINITY;
        }
    }

    private static boolean isDigit(char ch) {
        return ch >= '0' && ch <= '9';
    }

    private static boolean isParseIntWhitespace(char ch) {
        switch (ch) {
            case '\t':
            case '\n':
            case 0x0B:
            case '\f':
            case '\r':
            case ' ':
            case 0x00A0:
            case 0x1680:
            case 0x2028:
            case 0x2029:
            case 0x202F:
            case 0x205F:
            case 0x3000:
            case 0xFEFF:
                return true;
            default:
                return ch >= 0x2000 && ch <= 0x200A;
        }
    }

    /** 等价于 {@code value || null} 的字符串版本。 */
    public static String truthyStringOrNull(Object value) {
        return truthy(value) ? String.valueOf(value) : null;
    }

    /**
     * 等价于 JS 的 {@code String(value)}：数字按 JS 规则输出（整数值不补 .0），
     * 避免 Java 的 {@code String.valueOf(2.0)} 得到 "2.0" 而 JS 得到 "2"。
     */
    public static String toJsString(Object value) {
        if (value == null) {
            return "";
        }
        if (value instanceof Number number) {
            double result = number.doubleValue();
            if (Double.isNaN(result)) {
                return "NaN";
            }
            if (Double.isInfinite(result)) {
                return result > 0 ? "Infinity" : "-Infinity";
            }
            if (result == Math.rint(result) && Math.abs(result) < 1e21) {
                return String.valueOf((long) result);
            }
            return String.valueOf(result);
        }
        if (value instanceof Boolean bool) {
            return bool ? "true" : "false";
        }
        return String.valueOf(value);
    }
}
