package com.wangwenlin.stock.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * /api/auth 路由（6 个）—— 与 Node 端 backend/auth.js 的 installAuth 一一对应。
 * 中间件顺序也一致：originGuard（全部）→ rateLimit（register/login/account/password）→ 业务处理。
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    public ResponseEntity<Map<String, Object>> register(@RequestBody(required = false) Map<String, Object> body,
                                                       HttpServletRequest request, HttpServletResponse response) {
        authService.guardOrigin(request);
        authService.checkRateLimit(request);
        return ResponseEntity.status(201).body(authService.register(body(body), response));
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody(required = false) Map<String, Object> body,
                                     HttpServletRequest request, HttpServletResponse response) {
        authService.guardOrigin(request);
        authService.checkRateLimit(request);
        return authService.login(body(body), response);
    }

    @GetMapping("/me")
    public Map<String, Object> me(HttpServletRequest request, HttpServletResponse response) {
        authService.guardOrigin(request);
        noStore(response);
        return authService.me(request);
    }

    @PostMapping("/account")
    public Map<String, Object> account(@RequestBody(required = false) Map<String, Object> body,
                                       HttpServletRequest request, HttpServletResponse response) {
        authService.guardOrigin(request);
        authService.checkRateLimit(request);
        noStore(response);
        return authService.updateAccount(request, response, body(body));
    }

    @PostMapping("/password")
    public Map<String, Object> password(@RequestBody(required = false) Map<String, Object> body,
                                        HttpServletRequest request, HttpServletResponse response) {
        authService.guardOrigin(request);
        authService.checkRateLimit(request);
        noStore(response);
        return authService.updatePassword(request, response, body(body));
    }

    @PostMapping("/logout")
    public Map<String, Object> logout(HttpServletRequest request, HttpServletResponse response) {
        authService.guardOrigin(request);
        noStore(response);
        return authService.logout(request, response);
    }

    /** 对齐 Node 端 authenticate 里设置的 Cache-Control。 */
    private static void noStore(HttpServletResponse response) {
        response.setHeader("Cache-Control", "private, no-store");
    }

    private static Map<String, Object> body(Map<String, Object> body) {
        return body == null ? Map.of() : body;
    }
}
