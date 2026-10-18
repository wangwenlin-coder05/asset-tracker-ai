package com.wangwenlin.stock.auth;

import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.config.AppProperties;
import com.wangwenlin.stock.tenant.UserContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 会话鉴权 + CSRF + 同源校验，等价 Node 端 backend/auth.js 的 authenticate / originGuard。
 * <p>
 * 关键点：Node 端与 Spring 端共用同一个 {@code user_sessions} 表与同一个 cookie 名（stock_session），
 * 因此迁移期间登录态完全互通，前端无需重新登录（零中断）。
 */
@Component
public class AuthInterceptor implements HandlerInterceptor {

    public static final String COOKIE = "stock_session";
    private static final Pattern TOKEN_PATTERN = Pattern.compile("^[a-f0-9]{64}$");

    /**
     * 对齐 Node backend/auth.js:163-164 的 {@code app.use([...], localOnly)} 前缀清单。
     * Express 的前缀匹配规则是「路径等于前缀，或前缀后紧跟 /」，此处逐条复刻。
     */
    private static final List<String> LOCAL_ONLY_PREFIXES = List.of(
            "/api/wechat",
            "/api/extract",
            "/api/quant",
            "/api/quant-service",
            "/quant",
            "/api/ai/article-parse",
            "/api/deposits/save-icon");

    private static final String LOCAL_ONLY_ERROR = "该能力仅开放给本机所有者，云端已禁用";

    private final JdbcTemplate jdbcTemplate;
    private final AppProperties properties;
    private final Set<String> allowedOrigins;

    public AuthInterceptor(JdbcTemplate jdbcTemplate, AppProperties properties) {
        this.jdbcTemplate = jdbcTemplate;
        this.properties = properties;
        this.allowedOrigins = properties.originSet();
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        guardOrigin(request);
        // 登录/注册入口本身：Node 端只挂了 originGuard（router.use），不能再做会话校验
        if (isAuthEntry(request)) {
            return true;
        }
        SessionUser session = resolveSession(request);
        guardCsrf(request, session);
        guardLocalOnly(request, session);
        boolean local = isLocalOwner(request, session);
        UserContext.set(new UserContext.CurrentUser(session.id(), session.email(), session.role(), session.csrfToken(), session.hash(), local));
        response.setHeader("Cache-Control", "private, no-store");
        return true;
    }

    /**
     * 对齐 Node 端 backend/auth.js:161 —— {@code app.use('/api/auth', router)} 挂在
     * {@code app.use(['/api'], ..., authenticate)} 之前，因此 register/login 只过 originGuard；
     * 其余 /api/auth/**（含未被路由命中的路径）都会继续走到 /api 上的 authenticate。
     */
    private static boolean isAuthEntry(HttpServletRequest request) {
        if (!"POST".equals(request.getMethod())) {
            return false;
        }
        String path = request.getRequestURI();
        return "/api/auth/register".equals(path) || "/api/auth/login".equals(path);
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        UserContext.clear();
    }

    private void guardOrigin(HttpServletRequest request) {
        String origin = request.getHeader("Origin");
        if (origin != null && !origin.isBlank() && !allowedOrigins.contains(origin)) {
            throw ApiException.forbidden("来源不被允许");
        }
    }

    private SessionUser resolveSession(HttpServletRequest request) {
        String token = sessionToken(request);
        if (token == null) {
            throw ApiException.unauthorized("请先登录");
        }
        String tokenHash = sha256Hex(token);
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT u.id, u.email, u.role, s.csrf_token FROM user_sessions s "
                        + "JOIN users u ON u.id = s.user_id "
                        + "WHERE s.token_hash = ? AND s.expires_at > NOW() AND u.disabled = 0",
                tokenHash);
        if (rows.isEmpty()) {
            throw ApiException.unauthorized("登录已失效，请重新登录");
        }
        Map<String, Object> row = rows.get(0);
        return new SessionUser(((Number) row.get("id")).longValue(),
                String.valueOf(row.get("email")),
                String.valueOf(row.get("role")),
                String.valueOf(row.get("csrf_token")),
                tokenHash);
    }

    private void guardCsrf(HttpServletRequest request, SessionUser session) {
        String method = request.getMethod();
        if ("GET".equals(method) || "HEAD".equals(method) || "OPTIONS".equals(method)) {
            return;
        }
        String header = request.getHeader("x-csrf-token");
        if (!session.csrfToken().equals(header)) {
            throw ApiException.forbidden("CSRF 校验失败，请刷新页面");
        }
    }

    /**
     * 对齐 localOnly：命中前缀清单的请求必须是本机 owner，否则 403。
     * 在 CSRF 校验之后、写入 UserContext 之前执行，与 Node 的中间件串联顺序一致。
     */
    private void guardLocalOnly(HttpServletRequest request, SessionUser session) {
        String path = request.getRequestURI();
        if (path == null) {
            return;
        }
        for (String prefix : LOCAL_ONLY_PREFIXES) {
            if (path.equals(prefix) || path.startsWith(prefix + "/")) {
                if (!isLocalOwner(request, session)) {
                    throw ApiException.forbidden(LOCAL_ONLY_ERROR);
                }
                return;
            }
        }
    }

    /**
     * 对齐 localOnly：仅本机回环、无代理头、owner 角色且开启本地能力时才允许。
     */
    private boolean isLocalOwner(HttpServletRequest request, SessionUser session) {
        if (!properties.isEnableLocalFeatures() || !"owner".equals(session.role())) {
            return false;
        }
        String address = request.getRemoteAddr();
        boolean loopback = "127.0.0.1".equals(address)
                || "::1".equals(address)
                || "0:0:0:0:0:0:0:1".equals(address)
                || "::ffff:127.0.0.1".equals(address);
        boolean direct = request.getHeader("x-forwarded-for") == null && request.getHeader("forwarded") == null;
        String host = request.getServerName();
        boolean localHost = "localhost".equals(host)
                || "127.0.0.1".equals(host)
                || "::1".equals(host)
                || "[::1]".equals(host);
        return loopback && direct && localHost;
    }

    private static String sessionToken(HttpServletRequest request) {
        String cookieHeader = request.getHeader("cookie");
        if (cookieHeader == null) {
            return null;
        }
        for (String part : cookieHeader.split(";")) {
            String trimmed = part.trim();
            if (trimmed.startsWith(COOKIE + "=")) {
                String value = trimmed.substring(COOKIE.length() + 1);
                return TOKEN_PATTERN.matcher(value).matches() ? value : null;
            }
        }
        return null;
    }

    private static String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(bytes.length * 2);
            for (byte b : bytes) {
                builder.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
            }
            return builder.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 不可用", e);
        }
    }

    private record SessionUser(long id, String email, String role, String csrfToken, String hash) {
    }
}
