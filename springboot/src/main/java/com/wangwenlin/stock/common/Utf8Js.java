package com.wangwenlin.stock.common;

/**
 * 对齐 Node 的 {@code Buffer.toString('utf8')}（即 V8 / WHATWG 语义）的 UTF-8 解码。
 *
 * <p>Java 内置 UTF-8 解码器与 V8 有一处实质差异：对 {@code 0xED} 开头的「代理区」序列，
 * Java 会先按续字节组装再判代理，把 {@code ED A0 80} 整段并成 1 个 U+FFFD；
 * 而 V8 在读到第二个字节越界（ED 只允许 80..9F）时即按「最大合法前缀」报错，
 * 一个字节一个 U+FFFD。真实数据里（例如 Python 脚本用 GBK 写出的 stdout 再按 UTF-8 读）
 * 该差异会直接导致回包长度不同，故此处按 V8 规则重写。
 *
 * <p>规则归纳（已用大量样例与 Node 逐一比对确认）：
 * <ul>
 *   <li>续字节区间约束：E0 → A0..BF、ED → 80..9F、F0 → 90..BF、F4 → 80..8F，其余 80..BF</li>
 *   <li>续字节非法时：输出 1 个 U+FFFD，消费「首字节 + 已合法的续字节」，非法字节留给下一轮</li>
 *   <li>字节流在读满前中断（EOF）：整段未完成序列输出 1 个 U+FFFD</li>
 *   <li>非法首字节（80..C1、F5..FF）：输出 1 个 U+FFFD，消费 1 字节</li>
 * </ul>
 */
public final class Utf8Js {

    private Utf8Js() {
    }

    public static String decode(byte[] bytes) {
        return decode(bytes, 0, bytes.length);
    }

    public static String decode(byte[] bytes, int offset, int length) {
        StringBuilder sb = new StringBuilder(length);
        int i = offset;
        int end = offset + length;
        while (i < end) {
            int lead = bytes[i] & 0xFF;
            if (lead < 0x80) {
                sb.append((char) lead);
                i++;
                continue;
            }

            int need;
            int codePoint;
            int lower = 0x80;
            int upper = 0xBF;
            if (lead >= 0xC2 && lead <= 0xDF) {
                need = 1;
                codePoint = lead & 0x1F;
            } else if (lead >= 0xE0 && lead <= 0xEF) {
                need = 2;
                codePoint = lead & 0x0F;
                if (lead == 0xE0) {
                    lower = 0xA0;
                } else if (lead == 0xED) {
                    upper = 0x9F;
                }
            } else if (lead >= 0xF0 && lead <= 0xF4) {
                need = 3;
                codePoint = lead & 0x07;
                if (lead == 0xF0) {
                    lower = 0x90;
                } else if (lead == 0xF4) {
                    upper = 0x8F;
                }
            } else {
                sb.append('\uFFFD');
                i++;
                continue;
            }

            int cursor = i + 1;
            int consumed = 1;
            boolean broken = false;
            for (int k = 0; k < need; k++) {
                if (cursor >= end) {
                    broken = true;
                    break;
                }
                int next = bytes[cursor] & 0xFF;
                if (next < lower || next > upper) {
                    broken = true;
                    break;
                }
                codePoint = (codePoint << 6) | (next & 0x3F);
                lower = 0x80;
                upper = 0xBF;
                cursor++;
                consumed++;
            }

            if (broken) {
                sb.append('\uFFFD');
                i += consumed;
                continue;
            }

            if (codePoint <= 0xFFFF) {
                sb.append((char) codePoint);
            } else {
                int value = codePoint - 0x10000;
                sb.append((char) (0xD800 + (value >> 10)));
                sb.append((char) (0xDC00 + (value & 0x3FF)));
            }
            i = cursor;
        }
        return sb.toString();
    }
}
