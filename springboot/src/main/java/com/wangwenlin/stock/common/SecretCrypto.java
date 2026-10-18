package com.wangwenlin.stock.common;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;

/**
 * 对齐 Node 端 backend/secrets.js 的 AES-256-GCM 加解密：
 * 密文格式 {@code enc:v1:<nonce b64>:<tag b64>:<ciphertext b64>}，AAD 为 {@code <userId>:<settingKey>}，
 * 密钥取自环境变量 KEY_ENCRYPTION_KEY（32 字节随机密钥的 base64，与 Node 端同一把钥匙）。
 * 注意：Java 的 GCM 把认证标签拼在密文尾部返回，这里按 Node 的字段结构拆成独立的 tag 段。
 */
public final class SecretCrypto {

    private static final int TAG_LENGTH_BYTES = 16;
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder ENCODER = Base64.getEncoder();
    private static final Base64.Decoder DECODER = Base64.getDecoder();

    private SecretCrypto() {
    }

    public static boolean isSecret(String settingKey) {
        return settingKey != null && (settingKey.endsWith("_api_key") || "alapi_token".equals(settingKey));
    }

    public static byte[] key() {
        String raw = System.getProperty("KEY_ENCRYPTION_KEY");
        if (raw == null || raw.isEmpty()) {
            raw = System.getenv("KEY_ENCRYPTION_KEY");
        }
        byte[] value = raw == null ? new byte[0] : DECODER.decode(raw);
        if (value.length != 32) {
            throw new IllegalStateException("KEY_ENCRYPTION_KEY 必须是 32 字节随机密钥的 base64");
        }
        return value;
    }

    public static String encryptSecret(String value, long userId, String settingKey) {
        if (value == null || value.isEmpty()) {
            return "";
        }
        try {
            byte[] nonce = new byte[12];
            RANDOM.nextBytes(nonce);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key(), "AES"), new GCMParameterSpec(128, nonce));
            cipher.updateAAD((userId + ":" + settingKey).getBytes(StandardCharsets.UTF_8));
            byte[] combined = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            int split = combined.length - TAG_LENGTH_BYTES;
            byte[] ciphertext = Arrays.copyOfRange(combined, 0, split);
            byte[] tag = Arrays.copyOfRange(combined, split, combined.length);
            return "enc:v1:" + ENCODER.encodeToString(nonce)
                    + ":" + ENCODER.encodeToString(tag)
                    + ":" + ENCODER.encodeToString(ciphertext);
        } catch (Exception error) {
            throw new IllegalStateException(error.getMessage(), error);
        }
    }

    public static String decryptSecret(String value, long userId, String settingKey) {
        if (value == null || value.isEmpty()) {
            return "";
        }
        if (!value.startsWith("enc:v1:")) {
            throw new IllegalStateException("密钥尚未加密，请先执行 Phase 1 迁移");
        }
        String[] parts = value.split(":");
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key(), "AES"),
                    new GCMParameterSpec(128, DECODER.decode(parts[2])));
            cipher.updateAAD((userId + ":" + settingKey).getBytes(StandardCharsets.UTF_8));
            byte[] ciphertext = DECODER.decode(parts[4]);
            byte[] tag = DECODER.decode(parts[3]);
            byte[] combined = new byte[ciphertext.length + tag.length];
            System.arraycopy(ciphertext, 0, combined, 0, ciphertext.length);
            System.arraycopy(tag, 0, combined, ciphertext.length, tag.length);
            return new String(cipher.doFinal(combined), StandardCharsets.UTF_8);
        } catch (Exception error) {
            throw new IllegalStateException(error.getMessage(), error);
        }
    }
}
