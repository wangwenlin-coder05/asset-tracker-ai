package com.wangwenlin.stock.web;

import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseBody;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * /api 兜底 404。对齐 Node 端 server.js:14189 的
 * {@code app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在' }))}。
 *
 * <p>存在的意义不只是给出 404 文案，更是为了让「未命中的 /api 路径」也走一遍拦截器：
 * Node 的 {@code app.use(['/api'], authenticate)} 挂在路由之前，所以未登录访问不存在的
 * /api 路径会先被 401「请先登录」拦下；若交给 Spring 的
 * {@code throw-exception-if-no-handler-found} 处理，则会在拦截器之前直接变成 404。
 * 这里用一条优先级最低的映射把请求重新纳入 MVC 流程，具体路径的映射仍按「更精确优先」生效。
 */
@Controller
public class ApiFallbackController {

    @RequestMapping({"/api", "/api/**"})
    @ResponseBody
    public ResponseEntity<Map<String, Object>> notFound() {
        Map<String, Object> body = new LinkedHashMap<>(1);
        body.put("error", "接口不存在");
        return ResponseEntity.status(404).body(body);
    }
}
