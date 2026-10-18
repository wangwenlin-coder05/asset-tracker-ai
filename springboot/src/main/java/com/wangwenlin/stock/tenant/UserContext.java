package com.wangwenlin.stock.tenant;

import com.wangwenlin.stock.common.ApiException;

/**
 * 当前请求的用户上下文。等价 Node 端 backend/context.js 的 AsyncLocalStorage，
 * 但由于 Spring MVC 同步模型 + 虚拟线程未启用，使用 ThreadLocal 即可。
 */
public final class UserContext {

    public record CurrentUser(long id, String email, String role, String csrfToken, String sessionHash, boolean local) {
    }

    private static final ThreadLocal<CurrentUser> HOLDER = new ThreadLocal<>();

    private UserContext() {
    }

    public static void set(CurrentUser user) {
        HOLDER.set(user);
    }

    public static void clear() {
        HOLDER.remove();
    }

    public static CurrentUser current() {
        return HOLDER.get();
    }

    public static CurrentUser require() {
        CurrentUser user = HOLDER.get();
        if (user == null) {
            throw ApiException.unauthorized("请先登录");
        }
        return user;
    }

    /**
     * 取当前租户 id，非法时抛出。等价 Node 端 scopeSql 的 INVALID_TENANT 校验。
     */
    public static long requireUserId() {
        CurrentUser user = require();
        if (user.id() <= 0) {
            throw ApiException.unauthorized("请先登录");
        }
        return user.id();
    }
}
