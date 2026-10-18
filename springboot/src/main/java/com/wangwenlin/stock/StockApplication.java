package com.wangwenlin.stock;

import com.wangwenlin.stock.config.Dotenv;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 股票止盈计算器 —— Spring Boot 后端（增量并行迁移，与 Node/Express 端共用同一 MySQL）。
 */
@SpringBootApplication
@EnableScheduling
@ConfigurationPropertiesScan
@MapperScan("com.wangwenlin.stock.mapper")
public class StockApplication {

    public static void main(String[] args) {
        // 与 Node 端 require('dotenv').config() 对齐：仓库根目录 .env 作为最低优先级配置来源
        SpringApplication application = new SpringApplication(StockApplication.class);
        application.setDefaultProperties(Dotenv.load());
        application.run(args);
    }
}
