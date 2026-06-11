package com.example.drama;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
@MapperScan("com.example.drama.mapper")
public class DramaApplication {
    public static void main(String[] args) {
        SpringApplication.run(DramaApplication.class, args);
    }
}
