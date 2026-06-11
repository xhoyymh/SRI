package com.example.drama.config;

import jakarta.annotation.PostConstruct;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class SocialSchemaMigrator {
    private final JdbcTemplate jdbcTemplate;

    public SocialSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostConstruct
    public void migrate() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS user_account (
                  id BIGINT PRIMARY KEY AUTO_INCREMENT,
                  username VARCHAR(64) NOT NULL,
                  password_hash VARCHAR(128) NOT NULL,
                  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  last_login_time DATETIME,
                  UNIQUE KEY uk_username(username)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """);
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS user_session (
                  id BIGINT PRIMARY KEY AUTO_INCREMENT,
                  user_id BIGINT NOT NULL,
                  token_hash CHAR(64) NOT NULL,
                  device_id VARCHAR(64),
                  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                  expire_time DATETIME NOT NULL,
                  UNIQUE KEY uk_token_hash(token_hash),
                  KEY idx_user(user_id),
                  KEY idx_expire(expire_time)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """);
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS drama_social_action (
                  id BIGINT PRIMARY KEY AUTO_INCREMENT,
                  user_id BIGINT NOT NULL,
                  drama_id BIGINT NOT NULL,
                  action_type VARCHAR(16) NOT NULL,
                  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  UNIQUE KEY uk_user_drama_action(user_id, drama_id, action_type),
                  KEY idx_drama_action(drama_id, action_type)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """);
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS drama_comment (
                  id BIGINT PRIMARY KEY AUTO_INCREMENT,
                  drama_id BIGINT NOT NULL,
                  user_id BIGINT,
                  device_id VARCHAR(64),
                  nickname VARCHAR(64),
                  content TEXT NOT NULL,
                  client_comment_id VARCHAR(64),
                  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                  UNIQUE KEY uk_user_client_comment(user_id, client_comment_id),
                  KEY idx_drama_time(drama_id, create_time)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """);
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS episode_danmaku (
                  id BIGINT PRIMARY KEY AUTO_INCREMENT,
                  drama_id BIGINT,
                  episode_id BIGINT NOT NULL,
                  user_id BIGINT,
                  device_id VARCHAR(64),
                  nickname VARCHAR(64),
                  content VARCHAR(120) NOT NULL,
                  `current_time` DECIMAL(10,3) DEFAULT 0,
                  client_danmaku_id VARCHAR(64),
                  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                  UNIQUE KEY uk_user_client_danmaku(user_id, client_danmaku_id),
                  KEY idx_episode_time(episode_id, `current_time`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """);
        addColumnIfMissing("interaction", "user_id", "ALTER TABLE interaction ADD COLUMN user_id BIGINT NULL AFTER device_id");
        addIndexIfMissing("interaction", "idx_interaction_user", "CREATE INDEX idx_interaction_user ON interaction(user_id)");
    }

    private void addColumnIfMissing(String tableName, String columnName, String sql) {
        Integer count = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = ?
                  AND COLUMN_NAME = ?
                """, Integer.class, tableName, columnName);
        if (count == null || count == 0) {
            jdbcTemplate.execute(sql);
        }
    }

    private void addIndexIfMissing(String tableName, String indexName, String sql) {
        Integer count = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = ?
                  AND INDEX_NAME = ?
                """, Integer.class, tableName, indexName);
        if (count == null || count == 0) {
            jdbcTemplate.execute(sql);
        }
    }
}
