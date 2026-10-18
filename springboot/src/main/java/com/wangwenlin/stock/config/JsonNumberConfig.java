package com.wangwenlin.stock.config;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;
import com.fasterxml.jackson.databind.module.SimpleModule;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;
import java.math.BigDecimal;

/**
 * 数字序列化对齐 JS：JS 只有一种 number 类型，JSON.stringify(2.0) 输出 2。
 * Java 的 Double 默认输出 2.0，与 Node 端回包不一致，故统一改写。
 * 整数值且绝对值小于 1e15 按 long 输出；其余按最短往返表示输出；NaN/Infinity 输出 null。
 * 只对 Double / Float 生效，BigDecimal / Integer / Long 不受影响。
 */
@Configuration
public class JsonNumberConfig {

    /** 等价 JS JSON.stringify 对 number 的输出。 */
    public static final class JsNumberSerializer extends JsonSerializer<Number> {

        @Override
        public void serialize(Number value, JsonGenerator gen, SerializerProvider serializers) throws IOException {
            double number = value.doubleValue();
            if (!Double.isFinite(number)) {
                gen.writeNull();
                return;
            }
            if (number == Math.rint(number) && Math.abs(number) < 1e15) {
                gen.writeNumber((long) number);
                return;
            }
            gen.writeNumber(new BigDecimal(Double.toString(number)));
        }
    }

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer jsNumberCustomizer() {
        return builder -> {
            SimpleModule module = new SimpleModule();
            JsNumberSerializer serializer = new JsNumberSerializer();
            module.addSerializer(Double.class, serializer);
            module.addSerializer(double.class, serializer);
            module.addSerializer(Float.class, serializer);
            module.addSerializer(float.class, serializer);
            builder.modulesToInstall(module);
        };
    }
}
