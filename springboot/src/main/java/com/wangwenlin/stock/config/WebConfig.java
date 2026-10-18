package com.wangwenlin.stock.config;

import com.wangwenlin.stock.auth.AuthInterceptor;
import com.wangwenlin.stock.web.FrontendDist;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * 拦截 /api/**、/uploads/** 与 /quant/** 统一做鉴权；与 Node 端一致，业务接口、租户上传目录
 * 以及量化代理都需要登录态（Node 端 backend/auth.js 第 162 行把 /api、/quant、/uploads 一起挂了
 * authenticate）。/api/auth 不做整体放行——Node 端未命中路由的 /api/auth/** 同样会走到 authenticate，
 * 只有 register/login 两个入口在拦截器内单独跳过。
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final AuthInterceptor authInterceptor;
    private final FrontendDist frontendDist;

    public WebConfig(AuthInterceptor authInterceptor, FrontendDist frontendDist) {
        this.authInterceptor = authInterceptor;
        this.frontendDist = frontendDist;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(authInterceptor)
                .addPathPatterns("/api/**", "/uploads/**", "/quant", "/quant/**");
    }

    /**
     * 托管前端产物，对齐 Node 端 server.js:1150 的 {@code express.static('frontend/dist')}。
     * {@code application.yml} 关了默认静态映射（{@code add-mappings: false}），这里是唯一的静态来源。
     * 只处理静态文件：{@code /api/**} 由各 Controller 与兜底 404 接管、{@code /uploads/**} 由
     * UploadController 接管（Controller 优先级高于资源处理器），互不冲突。
     * 缓存头对齐 express.static 的默认值 {@code public, max-age=0}（每次带 ETag/Last-Modified 回源校验）。
     */
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/**")
                .addResourceLocations(frontendDist.locationUri())
                .setCacheControl(CacheControl.maxAge(0, TimeUnit.SECONDS).cachePublic());
    }

    /**
     * 把默认的 Jackson 转换器替换成带回包路径改写的版本（对齐 Node 端挂在 /api 上的 res.json 包装），
     * 其余序列化配置（ObjectMapper、支持的媒体类型）完全沿用原转换器，保证与 Node 逐字节一致。
     */
    @Override
    public void extendMessageConverters(List<HttpMessageConverter<?>> converters) {
        for (int index = 0; index < converters.size(); index++) {
            if (converters.get(index).getClass() == MappingJackson2HttpMessageConverter.class) {
                MappingJackson2HttpMessageConverter original = (MappingJackson2HttpMessageConverter) converters.get(index);
                UploadUrlJsonConverter replacement = new UploadUrlJsonConverter(original.getObjectMapper());
                replacement.setSupportedMediaTypes(original.getSupportedMediaTypes());
                converters.set(index, replacement);
                return;
            }
        }
    }
}
