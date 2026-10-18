package com.wangwenlin.stock.config;

import com.wangwenlin.stock.service.InstallmentService;
import com.wangwenlin.stock.tenant.UserContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * 启动时的分期排期自愈。对齐 Node 端 server.js:3316 在 {@code migrate()} 里调用的
 * {@code reconcileInstallmentSchedules()}：逐个计划比对「应有排期」与「库中排期」，
 * 不一致就重建账单（已还款的按到期日保留），并重算剩余金额。
 *
 * <p>Node 侧用的是原生连接（{@code SELECT * FROM installment_plans}，不限用户）。Spring 侧
 * {@code installment_plans / installment_bills} 都在租户白名单内，Mapper 会被自动注入
 * {@code user_id} 条件，因此这里先用 JdbcTemplate 取出全部有计划的 user_id（绕开租户拦截），
 * 再逐个用户带上下文跑一遍——覆盖面与 Node 等价。
 */
@Component
public class StartupReconcileRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(StartupReconcileRunner.class);

    private final JdbcTemplate jdbcTemplate;
    private final InstallmentService installmentService;

    public StartupReconcileRunner(JdbcTemplate jdbcTemplate, InstallmentService installmentService) {
        this.jdbcTemplate = jdbcTemplate;
        this.installmentService = installmentService;
    }

    @Override
    public void run(ApplicationArguments args) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("SELECT DISTINCT user_id FROM installment_plans");
        for (Map<String, Object> row : rows) {
            Object value = row.get("user_id");
            long userId = value instanceof Number number ? number.longValue() : 0L;
            if (userId <= 0) {
                continue;
            }
            UserContext.set(new UserContext.CurrentUser(userId, "", "owner", "", "", true));
            try {
                installmentService.reconcile();
            } catch (Exception failure) {
                // 自愈失败不阻断启动：Node 侧会连带 migrate 一起抛错导致起不来，这里改为记录日志
                log.warn("分期排期自愈失败 user_id={}", userId, failure);
            } finally {
                UserContext.clear();
            }
        }
    }
}
