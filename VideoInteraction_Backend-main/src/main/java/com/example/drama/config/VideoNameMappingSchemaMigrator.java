package com.example.drama.config;

import jakarta.annotation.PostConstruct;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class VideoNameMappingSchemaMigrator {
    private final JdbcTemplate jdbcTemplate;

    public VideoNameMappingSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostConstruct
    public void migrate() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS video_name_mapping (
                  id BIGINT PRIMARY KEY AUTO_INCREMENT,
                  drama_id BIGINT,
                  episode_id BIGINT,
                  video_asset_id BIGINT,
                  batch_id BIGINT,
                  drama_no INT,
                  drama_code VARCHAR(32),
                  drama_title VARCHAR(128) NOT NULL,
                  original_folder_name VARCHAR(255),
                  original_file_name VARCHAR(255),
                  normalized_file_name VARCHAR(255) NOT NULL,
                  episode_no INT NOT NULL,
                  backend_key VARCHAR(512),
                  cos_key VARCHAR(512),
                  cos_url VARCHAR(1024),
                  file_size BIGINT,
                  content_type VARCHAR(64),
                  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  UNIQUE KEY uk_normalized_file(normalized_file_name),
                  KEY idx_drama_episode(drama_no, episode_no),
                  KEY idx_asset(video_asset_id),
                  KEY idx_batch(batch_id)
                )
                """);
    }
}
