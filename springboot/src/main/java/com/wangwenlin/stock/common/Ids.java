package com.wangwenlin.stock.common;

import java.util.concurrent.ThreadLocalRandom;

/**
 * 对齐 Node 端 genId()：时间戳 + 随机 36 进制尾串。
 */
public final class Ids {

    private static final char[] BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz".toCharArray();

    private Ids() {
    }

    /** 对齐 Node 端 crypto.randomUUID()：36 位带连字符的小写 UUID。 */
    public static String uuid() {
        return java.util.UUID.randomUUID().toString();
    }

    public static String genId() {
        StringBuilder builder = new StringBuilder(Long.toString(System.currentTimeMillis()));
        ThreadLocalRandom random = ThreadLocalRandom.current();
        for (int i = 0; i < 11; i++) {
            builder.append(BASE36[random.nextInt(BASE36.length)]);
        }
        return builder.toString();
    }

    /**
     * 对齐 JS {@code Math.random().toString(36).slice(2, 8)}：1~6 位小写 36 进制随机串
     * （JS 的随机小数转 36 进制后偶尔不足 6 位，这里保持同样的「不补零」行为）。
     */
    public static String base36Six() {
        return Long.toString(ThreadLocalRandom.current().nextLong(2_176_782_336L), 36);
    }
}
