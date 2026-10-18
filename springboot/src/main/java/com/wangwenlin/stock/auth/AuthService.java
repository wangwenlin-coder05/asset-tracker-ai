package com.wangwenlin.stock.auth;

import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.common.JsStrings;
import com.wangwenlin.stock.common.JsValues;
import com.wangwenlin.stock.config.AppProperties;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.env.Environment;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Pattern;

/**
 * 账号与会话服务。逐行对齐 Node 端 backend/auth.js（installAuth 内 6 条路由 + createSession /
 * updateCredentials / authenticate 全部语义），两侧共用同一张 user_sessions 表，迁移期登录态互通。
 *
 * <p>路由本身在 {@link AuthController}，此处只放业务逻辑，便于与 Node 的中间件串联顺序对齐：
 * originGuard → rateLimit → 业务处理。
 */
@Service
public class AuthService {

    public static final String COOKIE = "stock_session";
    private static final long SESSION_MS = 7L * 24 * 60 * 60 * 1000;
    private static final int MAX_ATTEMPTS = 30;
    private static final long ATTEMPT_WINDOW_MS = 15L * 60 * 1000;
    private static final int MAX_ATTEMPT_ENTRIES = 10000;
    private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "OPTIONS");
    private static final Pattern TOKEN_PATTERN = Pattern.compile("^[a-f0-9]{64}$");

    /**
     * 对齐 JS 的 {@code /^[^\s@]+@[^\s@]+\.[^\s@]+$/}：JS 的 {@code \s} 覆盖 Unicode 空白，
     * 不能直接复用 Java 的 ASCII-only {@code \s}，故显式列出全部空白码位。
     */
    private static final Pattern EMAIL_PATTERN = Pattern.compile(
            "^[^\\t\\n\\x0B\\f\\r \\x{00A0}\\x{1680}\\x{2000}-\\x{200A}\\x{2028}\\x{2029}\\x{202F}\\x{205F}\\x{3000}\\x{FEFF}@]"
                    + "+@[^\\t\\n\\x0B\\f\\r \\x{00A0}\\x{1680}\\x{2000}-\\x{200A}\\x{2028}\\x{2029}\\x{202F}\\x{205F}\\x{3000}\\x{FEFF}@]"
                    + "+\\.[^\\t\\n\\x0B\\f\\r \\x{00A0}\\x{1680}\\x{2000}-\\x{200A}\\x{2028}\\x{2029}\\x{202F}\\x{205F}\\x{3000}\\x{FEFF}@]+$");

    private final JdbcTemplate jdbcTemplate;
    private final AppProperties properties;
    private final Environment environment;
    private final Set<String> allowedOrigins;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(12);
    /** 对齐 Node 端模块加载时算一次的 dummyHash，用于邮箱不存在时的等时比较。 */
    private final String dummyHash = encoder.encode("not-a-valid-password");
    private final SecureRandom random = new SecureRandom();
    private final Map<String, Attempt> attempts = new ConcurrentHashMap<>();

    public AuthService(JdbcTemplate jdbcTemplate, AppProperties properties, Environment environment) {
        this.jdbcTemplate = jdbcTemplate;
        this.properties = properties;
        this.environment = environment;
        this.allowedOrigins = properties.originSet();
    }

    /** 对齐 router.use(originGuard)：Origin 有值且不在白名单内即 403。 */
    public void guardOrigin(HttpServletRequest request) {
        String origin = request.getHeader("Origin");
        if (origin != null && !origin.isEmpty() && !allowedOrigins.contains(origin)) {
            throw ApiException.forbidden("来源不被允许");
        }
    }

    /** 对齐 rateLimit：按 IP 计数，15 分钟窗口内超过 30 次即 429；共享同一张计数表。 */
    public void checkRateLimit(HttpServletRequest request) {
        long now = System.currentTimeMillis();
        attempts.entrySet().removeIf(entry -> entry.getValue().until() <= now);
        Attempt entry = attempts.computeIfAbsent(request.getRemoteAddr(), key -> new Attempt(now + ATTEMPT_WINDOW_MS));
        int count = entry.increment();
        if (count > MAX_ATTEMPTS || attempts.size() > MAX_ATTEMPT_ENTRIES) {
            throw new ApiException(429, "请求过于频繁，请稍后重试");
        }
    }

    /** POST /api/auth/register */
    public Map<String, Object> register(Map<String, Object> body, HttpServletResponse response) {
        if (!properties.isRegistrationOpen()) {
            throw ApiException.forbidden("暂未开放注册");
        }
        String email = normalizeEmail(body.get("email"));
        Object passwordValue = body.get("password");
        if (!EMAIL_PATTERN.matcher(email).matches() || email.length() > 254
                || !(passwordValue instanceof String password)
                || password.length() < 8 || utf8Length(password) > 72) {
            throw ApiException.badRequest("请输入有效邮箱，密码至少 8 字符且不超过 72 字节");
        }
        String hash = encoder.encode(password);
        KeyHolder keyHolder = new GeneratedKeyHolder();
        try {
            jdbcTemplate.update(connection -> {
                PreparedStatement statement = connection.prepareStatement(
                        "INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)",
                        Statement.RETURN_GENERATED_KEYS);
                statement.setString(1, email);
                statement.setString(2, hash);
                statement.setString(3, "user");
                return statement;
            }, keyHolder);
        } catch (DuplicateKeyException duplicate) {
            throw ApiException.conflict("该邮箱已注册");
        }
        Number key = keyHolder.getKey();
        long userId = key == null ? 0L : key.longValue();
        return createSession(userId, email, "user", response);
    }

    /** POST /api/auth/login */
    public Map<String, Object> login(Map<String, Object> body, HttpServletResponse response) {
        String email = normalizeEmail(body.get("email"));
        Object passwordValue = body.get("password");
        if (!(passwordValue instanceof String password) || utf8Length(password) > 72 || email.length() > 254) {
            throw ApiException.badRequest("登录参数无效");
        }
        Map<String, Object> user = firstRow("SELECT id, email, password_hash, role, disabled FROM users WHERE email = ?", email);
        Object stored = user == null ? null : user.get("password_hash");
        boolean valid = encoder.matches(password, stored == null ? dummyHash : String.valueOf(stored));
        if (!valid || user == null || JsValues.truthy(user.get("disabled"))) {
            throw ApiException.unauthorized("邮箱或密码错误");
        }
        return createSession(longValue(user.get("id")), String.valueOf(user.get("email")),
                String.valueOf(user.get("role")), response);
    }

    /** GET /api/auth/me */
    public Map<String, Object> me(HttpServletRequest request) {
        SessionUser user = authenticate(request);
        Map<String, Object> body = new LinkedHashMap<>(2);
        body.put("user", publicUser(user.id(), user.email(), user.role()));
        body.put("csrfToken", user.csrfToken());
        return body;
    }

    /** POST /api/auth/logout */
    public Map<String, Object> logout(HttpServletRequest request, HttpServletResponse response) {
        SessionUser user = authenticate(request);
        jdbcTemplate.update("DELETE FROM user_sessions WHERE token_hash = ?", user.hash());
        // 对齐 res.clearCookie(COOKIE, { path: '/' })：Express 序列化为 name=; Path=/; Expires=<纪元>
        // （ResponseCookie 只能经 maxAge 推导 Expires，拿不到 1970 这个固定值，故直接给出与 Express 等价的串）
        response.addHeader(HttpHeaders.SET_COOKIE, COOKIE + "=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT");
        Map<String, Object> body = new LinkedHashMap<>(1);
        body.put("ok", true);
        return body;
    }

    /** POST /api/auth/account */
    @Transactional
    public Map<String, Object> updateAccount(HttpServletRequest request, HttpServletResponse response,
                                            Map<String, Object> body) {
        return updateCredentials(request, response, body, "account");
    }

    /** POST /api/auth/password */
    @Transactional
    public Map<String, Object> updatePassword(HttpServletRequest request, HttpServletResponse response,
                                              Map<String, Object> body) {
        return updateCredentials(request, response, body, "password");
    }

    /**
     * 对齐 updateCredentials：先 FOR UPDATE 校验当前密码，再改凭证、清掉该用户全部旧会话、
     * 重新签发一次会话并回写 cookie。事务由 {@link #updateAccount} / {@link #updatePassword}
     * 两个入口开启（@Transactional 走代理，自调用不生效，故不能标在这里）。
     */
    private Map<String, Object> updateCredentials(HttpServletRequest request, HttpServletResponse response,
                                                  Map<String, Object> body, String kind) {
        SessionUser current = authenticate(request);
        Object currentValue = body.get("currentPassword");
        if (!(currentValue instanceof String currentPassword) || currentPassword.isEmpty()
                || utf8Length(currentPassword) > 72) {
            throw ApiException.badRequest("请输入当前密码");
        }
        boolean account = "account".equals(kind);
        String email = account ? normalizeEmail(body.get("email")) : null;
        Object newValue = body.get("newPassword");
        if (account && (!EMAIL_PATTERN.matcher(email).matches() || email.length() > 254)) {
            throw ApiException.badRequest("请输入有效的邮箱账号");
        }
        if (!account && (!(newValue instanceof String newPassword)
                || newPassword.length() < 8 || utf8Length(newPassword) > 72)) {
            throw ApiException.badRequest("新密码至少 8 字符且不超过 72 字节");
        }
        if (!account && newValue.equals(currentPassword)) {
            throw ApiException.badRequest("新密码不能与当前密码相同");
        }
        Map<String, Object> user = firstRow(
                "SELECT id, email, role, password_hash, disabled FROM users WHERE id = ? FOR UPDATE", current.id());
        Object stored = user == null ? null : user.get("password_hash");
        boolean passwordOk = stored != null && encoder.matches(currentPassword, String.valueOf(stored));
        if (user == null || JsValues.truthy(user.get("disabled")) || !passwordOk) {
            throw ApiException.unauthorized("当前密码错误");
        }
        long userId = longValue(user.get("id"));
        if (account) {
            try {
                jdbcTemplate.update("UPDATE users SET email = ? WHERE id = ?", email, userId);
            } catch (DuplicateKeyException duplicate) {
                throw ApiException.conflict("该邮箱已被其他账号使用");
            }
            user.put("email", email);
        } else {
            jdbcTemplate.update("UPDATE users SET password_hash = ? WHERE id = ?",
                    encoder.encode((String) newValue), userId);
        }
        jdbcTemplate.update("DELETE FROM user_sessions WHERE user_id = ?", userId);
        Session session = createSessionRecord(userId, String.valueOf(user.get("email")), String.valueOf(user.get("role")));
        return applySessionCookie(session, response);
    }

    /** 对齐 authenticate：取 cookie token（须 64 位 hex）→ 查会话 → 非安全方法校验 CSRF。 */
    private SessionUser authenticate(HttpServletRequest request) {
        String token = sessionToken(request);
        if (token == null) {
            throw ApiException.unauthorized("请先登录");
        }
        String tokenHash = sha256Hex(token);
        Map<String, Object> row = firstRow("SELECT u.id, u.email, u.role, s.csrf_token FROM user_sessions s "
                + "JOIN users u ON u.id = s.user_id "
                + "WHERE s.token_hash = ? AND s.expires_at > NOW() AND u.disabled = 0", tokenHash);
        if (row == null) {
            throw ApiException.unauthorized("登录已失效，请重新登录");
        }
        String csrfToken = String.valueOf(row.get("csrf_token"));
        if (!SAFE_METHODS.contains(request.getMethod()) && !csrfToken.equals(request.getHeader("x-csrf-token"))) {
            throw ApiException.forbidden("CSRF 校验失败，请刷新页面");
        }
        return new SessionUser(longValue(row.get("id")), String.valueOf(row.get("email")),
                String.valueOf(row.get("role")), csrfToken, tokenHash);
    }

    /** 对齐 createSession：先清过期会话，再签发新会话并回写 cookie。 */
    private Map<String, Object> createSession(long userId, String email, String role, HttpServletResponse response) {
        jdbcTemplate.update("DELETE FROM user_sessions WHERE expires_at < NOW()");
        return applySessionCookie(createSessionRecord(userId, email, role), response);
    }

    /** 对齐 createSessionRecord：32 字节随机数转 hex，落库的是 sha256(token)。 */
    private Session createSessionRecord(long userId, String email, String role) {
        String token = randomHex(32);
        String csrfToken = randomHex(32);
        jdbcTemplate.update("INSERT INTO user_sessions (token_hash, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)",
                sha256Hex(token), userId, csrfToken, new Timestamp(System.currentTimeMillis() + SESSION_MS));
        return new Session(token, csrfToken, userId, email, role);
    }

    /** 对齐 applySessionCookie：httpOnly + SameSite=Lax + path=/ + 7 天有效期。 */
    private Map<String, Object> applySessionCookie(Session session, HttpServletResponse response) {
        ResponseCookie cookie = ResponseCookie.from(COOKIE, session.token())
                .httpOnly(true)
                .secure(properties.isCookieSecure() || "production".equals(nodeEnv()))
                .sameSite("Lax")
                .path("/")
                .maxAge(Duration.ofMillis(SESSION_MS))
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
        Map<String, Object> body = new LinkedHashMap<>(2);
        body.put("user", publicUser(session.userId(), session.email(), session.role()));
        body.put("csrfToken", session.csrfToken());
        return body;
    }

    /** 对齐 publicUser：capabilities.localFeatures = 非生产 + 开启本地能力 + owner 角色。 */
    private Map<String, Object> publicUser(long id, String email, String role) {
        Map<String, Object> capabilities = new LinkedHashMap<>(1);
        capabilities.put("localFeatures", !"production".equals(nodeEnv())
                && properties.isEnableLocalFeatures() && "owner".equals(role));
        Map<String, Object> user = new LinkedHashMap<>(4);
        user.put("id", id);
        user.put("email", email);
        user.put("role", role);
        user.put("capabilities", capabilities);
        return user;
    }

    private String nodeEnv() {
        return environment.getProperty("NODE_ENV", "");
    }

    private static String normalizeEmail(Object value) {
        return JsStrings.trim(JsValues.orEmpty(value)).toLowerCase(Locale.ROOT);
    }

    private static int utf8Length(String value) {
        return value.getBytes(StandardCharsets.UTF_8).length;
    }

    private static long longValue(Object value) {
        return value instanceof Number number ? number.longValue() : 0L;
    }

    private Map<String, Object> firstRow(String sql, Object... args) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql, args);
        return rows.isEmpty() ? null : rows.get(0);
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

    private String randomHex(int bytes) {
        byte[] buffer = new byte[bytes];
        random.nextBytes(buffer);
        return toHex(buffer);
    }

    private static String sha256Hex(String value) {
        try {
            return toHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 不可用", e);
        }
    }

    private static String toHex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            builder.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
        }
        return builder.toString();
    }

    private record Session(String token, String csrfToken, long userId, String email, String role) {
    }

    private record SessionUser(long id, String email, String role, String csrfToken, String hash) {
    }

    /** 对齐 Node 端 attempts 的 { count, until } 结构。 */
    private static final class Attempt {
        private final AtomicInteger count = new AtomicInteger();
        private final long until;

        private Attempt(long until) {
            this.until = until;
        }

        private int increment() {
            return count.incrementAndGet();
        }

        private long until() {
            return until;
        }
    }
}
