package com.wangwenlin.stock.common;

/**
 * 少量 JS 字符串语义对齐工具，避免 Java 默认行为与 Node 差异导致响应不一致。
 */
public final class JsStrings {

    private JsStrings() {
    }

    /** JS {@code \s} 覆盖的空白字符集合（含 NBSP、全角空格、BOM 等）。 */
    private static boolean isJsWhitespace(char ch) {
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

    /** 等价 JS {@code String.prototype.trim()}：两端去掉所有 JS 空白字符。 */
    public static String trim(String value) {
        if (value == null || value.isEmpty()) {
            return "";
        }
        int start = 0;
        int end = value.length();
        while (start < end && isJsWhitespace(value.charAt(start))) {
            start++;
        }
        while (end > start && isJsWhitespace(value.charAt(end - 1))) {
            end--;
        }
        return value.substring(start, end);
    }

    /** 等价 JS {@code str.replace(/\s+/g, '')}：去掉全部 JS 空白字符。 */
    public static String removeAllWhitespace(String value) {
        if (value == null || value.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder(value.length());
        for (int i = 0; i < value.length(); i++) {
            char ch = value.charAt(i);
            if (!isJsWhitespace(ch)) {
                sb.append(ch);
            }
        }
        return sb.toString();
    }

    /**
     * 等价 {@code Array.from(str.replace(/\s/g, '')).length}：
     * 去掉全部 JS 空白后，按 UTF-16 代理对合并计 1 个字符（即 code point 计数）。
     */
    public static int countNonWhitespaceCodePoints(String value) {
        if (value == null) {
            return 0;
        }
        int count = 0;
        int index = 0;
        int length = value.length();
        while (index < length) {
            char ch = value.charAt(index);
            if (isJsWhitespace(ch)) {
                index++;
                continue;
            }
            if (Character.isHighSurrogate(ch) && index + 1 < length
                    && Character.isLowSurrogate(value.charAt(index + 1))) {
                index += 2;
            } else {
                index++;
            }
            count++;
        }
        return count;
    }
}
