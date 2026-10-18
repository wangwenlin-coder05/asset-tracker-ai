package com.wangwenlin.stock.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wangwenlin.stock.tenant.UserContext;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpOutputMessage;
import org.springframework.http.converter.HttpMessageNotWritableException;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;

/**
 * 等价 Node 端 backend/auth.js 第 165-169 行挂在 /api 上的 res.json 包装：
 * 所有 JSON 回包统一把 {@code uploads/<分类>/} 改写成 {@code uploads/users/<当前用户id>/<分类>/}。
 * <p>
 * 实现方式与 Node 完全一致 —— 先按 JS 的 JSON.stringify 语义序列化，再对序列化后的字符串做正则替换，
 * 因此 "uploads/xxx" 出现在任何位置（对象字段、数组元素、更长的字符串里）都会被改写。
 * 未登录上下文（如 /api/auth/**）不参与改写，与 Node 端挂载顺序一致。
 */
public class UploadUrlJsonConverter extends MappingJackson2HttpMessageConverter {

    /** 与 Node 端 rewriteUploadUrls 的正则逐字符对应。 */
    private static final Pattern UPLOAD_PATH = Pattern.compile("(^|[\"'(\\s])/?uploads/(?!users/)([a-z]+/)");

    public UploadUrlJsonConverter(ObjectMapper objectMapper) {
        super(objectMapper);
    }

    @Override
    protected void writeInternal(Object object, Type type, HttpOutputMessage outputMessage)
            throws IOException, HttpMessageNotWritableException {
        UserContext.CurrentUser user = UserContext.current();
        boolean rewriteUploads = user != null && user.id() > 0;

        ByteArrayOutputStream buffer = new ByteArrayOutputStream(1024);
        super.writeInternal(object, type, new BufferOutputMessage(outputMessage, buffer));
        // Jackson 的 UTF8JsonGenerator 会把代理对写成 U+ 转义（反斜杠 u 形式），而 Node 的 JSON.stringify
        // 直接输出原始字符，这里统一还原成原始字符，保证回包与 Node 逐字节一致。
        String json = unescapeSurrogatePairs(buffer.toString(StandardCharsets.UTF_8));
        if (rewriteUploads) {
            json = UPLOAD_PATH.matcher(json).replaceAll("$1uploads/users/" + user.id() + "/$2");
        }
        outputMessage.getBody().write(json.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * 把 JSON 字符串字面量里的「高位代理转义 + 低位代理转义」合并回原始字符（等价 JS 的 JSON.stringify 输出）。
     * 只合并成对出现的合法代理对；孤立的代理转义（Node 也会转义）与非代理转义一律原样保留。
     */
    static String unescapeSurrogatePairs(String json) {
        int length = json.length();
        StringBuilder out = null;
        boolean inString = false;
        int copyFrom = 0;
        int index = 0;
        while (index < length) {
            char ch = json.charAt(index);
            if (ch == '"') {
                inString = !inString;
                index++;
                continue;
            }
            if (!inString || ch != '\\' || index + 1 >= length) {
                index++;
                continue;
            }
            char escaped = json.charAt(index + 1);
            if (escaped != 'u' || index + 6 > length) {
                index += 2;
                continue;
            }
            int high = parseHex4(json, index + 2);
            if (high >= 0xD800 && high <= 0xDBFF && index + 12 <= length
                    && json.charAt(index + 6) == '\\' && json.charAt(index + 7) == 'u') {
                int low = parseHex4(json, index + 8);
                if (low >= 0xDC00 && low <= 0xDFFF) {
                    if (out == null) {
                        out = new StringBuilder(length + 16);
                    }
                    out.append(json, copyFrom, index).append((char) high).append((char) low);
                    index += 12;
                    copyFrom = index;
                    continue;
                }
            }
            index += 6;
        }
        if (out == null) {
            return json;
        }
        return out.append(json, copyFrom, length).toString();
    }

    private static int parseHex4(String text, int start) {
        int value = 0;
        for (int offset = 0; offset < 4; offset++) {
            int digit = Character.digit(text.charAt(start + offset), 16);
            if (digit < 0) {
                return -1;
            }
            value = (value << 4) | digit;
        }
        return value;
    }


    /** 让 Jackson 先写进内存缓冲区，再统一做路径改写。 */
    private record BufferOutputMessage(HttpOutputMessage delegate, ByteArrayOutputStream buffer) implements HttpOutputMessage {

        @Override
        public HttpHeaders getHeaders() {
            return delegate.getHeaders();
        }

        @Override
        public OutputStream getBody() {
            return buffer;
        }
    }
}
