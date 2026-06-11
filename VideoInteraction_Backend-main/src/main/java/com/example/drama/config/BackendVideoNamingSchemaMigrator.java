package com.example.drama.config;

import jakarta.annotation.PostConstruct;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class BackendVideoNamingSchemaMigrator {
    private final JdbcTemplate jdbcTemplate;

    public BackendVideoNamingSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostConstruct
    public void migrate() {
        addColumnIfMissing("drama", "drama_no", "ALTER TABLE drama ADD COLUMN drama_no INT");
        addColumnIfMissing("drama", "drama_code", "ALTER TABLE drama ADD COLUMN drama_code VARCHAR(32)");
        addColumnIfMissing("drama", "original_folder_name", "ALTER TABLE drama ADD COLUMN original_folder_name VARCHAR(255)");
        addIndexIfMissing("drama", "idx_drama_code", "CREATE INDEX idx_drama_code ON drama(drama_code)");

        addColumnIfMissing("episode", "original_file_name", "ALTER TABLE episode ADD COLUMN original_file_name VARCHAR(255)");
        addColumnIfMissing("episode", "normalized_file_name", "ALTER TABLE episode ADD COLUMN normalized_file_name VARCHAR(255)");
        addColumnIfMissing("episode", "backend_key", "ALTER TABLE episode ADD COLUMN backend_key VARCHAR(512)");
        addColumnIfMissing("episode", "cos_key", "ALTER TABLE episode ADD COLUMN cos_key VARCHAR(512)");
        addIndexIfMissing("episode", "idx_episode_normalized_file", "CREATE INDEX idx_episode_normalized_file ON episode(normalized_file_name)");

        addColumnIfMissing("video_asset", "drama_no", "ALTER TABLE video_asset ADD COLUMN drama_no INT");
        addColumnIfMissing("video_asset", "drama_code", "ALTER TABLE video_asset ADD COLUMN drama_code VARCHAR(32)");
        addColumnIfMissing("video_asset", "normalized_file_name", "ALTER TABLE video_asset ADD COLUMN normalized_file_name VARCHAR(255)");
        addColumnIfMissing("video_asset", "backend_key", "ALTER TABLE video_asset ADD COLUMN backend_key VARCHAR(512)");
        addIndexIfMissing("video_asset", "idx_asset_normalized_file", "CREATE INDEX idx_asset_normalized_file ON video_asset(normalized_file_name)");
    }

    private void addColumnIfMissing(String table, String column, String ddl) {
        Integer count = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = ?
                  AND COLUMN_NAME = ?
                """, Integer.class, table, column);
        if (count == null || count == 0) {
            jdbcTemplate.execute(ddl);
        }
    }

    private void addIndexIfMissing(String table, String index, String ddl) {
        Integer count = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                FROM INFORMATION_SCHEMA.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = ?
                  AND INDEX_NAME = ?
                """, Integer.class, table, index);
        if (count == null || count == 0) {
            jdbcTemplate.execute(ddl);
        }
    }
}
