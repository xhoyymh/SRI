package com.example.drama.config;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class VideoAssetRagSchemaMigrator implements ApplicationRunner {
    private final JdbcTemplate jdbcTemplate;

    public VideoAssetRagSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        addColumnIfMissing("video_asset", "rag_status", "ALTER TABLE video_asset ADD COLUMN rag_status VARCHAR(32) DEFAULT 'WAITING_UPLOAD'");
        addColumnIfMissing("video_asset", "rag_task_id", "ALTER TABLE video_asset ADD COLUMN rag_task_id BIGINT");
        addColumnIfMissing("video_asset", "rag_message", "ALTER TABLE video_asset ADD COLUMN rag_message VARCHAR(512)");
        addColumnIfMissing("video_asset", "rag_update_time", "ALTER TABLE video_asset ADD COLUMN rag_update_time DATETIME");
        addIndexIfMissing("video_asset", "idx_rag_status", "CREATE INDEX idx_rag_status ON video_asset(rag_status)");
        addIndexIfMissing("video_asset", "idx_rag_task", "CREATE INDEX idx_rag_task ON video_asset(rag_task_id)");
        addColumnIfMissing("upload_batch", "user_id", "ALTER TABLE upload_batch ADD COLUMN user_id BIGINT NULL AFTER drama_id");
        addIndexIfMissing("upload_batch", "idx_upload_batch_user", "CREATE INDEX idx_upload_batch_user ON upload_batch(user_id)");
        addColumnIfMissing("upload_batch", "rag_status", "ALTER TABLE upload_batch ADD COLUMN rag_status VARCHAR(32) DEFAULT 'WAITING_UPLOAD'");
        addColumnIfMissing("upload_batch", "rag_task_id", "ALTER TABLE upload_batch ADD COLUMN rag_task_id BIGINT");
        addColumnIfMissing("upload_batch", "rag_message", "ALTER TABLE upload_batch ADD COLUMN rag_message VARCHAR(512)");
        addColumnIfMissing("upload_batch", "rag_update_time", "ALTER TABLE upload_batch ADD COLUMN rag_update_time DATETIME");
        jdbcTemplate.update("""
                UPDATE video_asset
                SET rag_status = 'PENDING'
                WHERE asset_type = 'SOURCE_VIDEO'
                  AND status = 'UPLOADED'
                  AND (rag_status IS NULL OR rag_status = '' OR rag_status = 'WAITING_UPLOAD')
                """);
        jdbcTemplate.update("""
                UPDATE video_asset
                SET rag_status = 'WAITING_UPLOAD'
                WHERE rag_status IS NULL OR rag_status = ''
                """);
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
