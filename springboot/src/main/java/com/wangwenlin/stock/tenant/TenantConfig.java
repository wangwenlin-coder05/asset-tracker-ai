package com.wangwenlin.stock.tenant;

import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.handler.TenantLineHandler;
import com.baomidou.mybatisplus.extension.plugins.inner.TenantLineInnerInterceptor;
import com.wangwenlin.stock.common.ApiException;
import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.expression.LongValue;
import net.sf.jsqlparser.schema.Column;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

/**
 * 租户隔离配置。等价于 Node 端 backend/tenant-db.js 的 AST 级改写：
 * <ul>
 *   <li>SELECT / UPDATE / DELETE：自动追加 user_id = 当前登录用户 的条件</li>
 *   <li>INSERT：自动补齐 user_id 列与值；显式传入 user_id 直接拒绝（对齐 Node 的“禁止自定义租户的写入”）</li>
 *   <li>非业务表白名单之外的表不做任何裁剪（users/user_sessions 等走原生连接）</li>
 * </ul>
 */
@Configuration
public class TenantConfig {

    public static final String TENANT_COLUMN = "user_id";

    @Bean
    public MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
        interceptor.addInnerInterceptor(new TenantLineInnerInterceptor(new TenantLineHandler() {

            @Override
            public Expression getTenantId() {
                return new LongValue(UserContext.requireUserId());
            }

            @Override
            public String getTenantIdColumn() {
                return TENANT_COLUMN;
            }

            @Override
            public boolean ignoreTable(String tableName) {
                // 只对业务表注入租户条件
                return !BusinessTables.isBusiness(tableName);
            }

            @Override
            public boolean ignoreInsert(List<Column> columns, String tenantIdColumn) {
                // 与 Node 一致：若业务代码显式声明 user_id，视为越权写入，直接拒绝
                boolean declared = columns.stream()
                        .anyMatch(column -> tenantIdColumn.equalsIgnoreCase(column.getColumnName()));
                if (declared) {
                    throw ApiException.forbidden("禁止指定租户字段写入");
                }
                return false;
            }
        }));
        return interceptor;
    }
}
