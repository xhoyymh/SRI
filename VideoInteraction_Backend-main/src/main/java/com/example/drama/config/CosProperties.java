package com.example.drama.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "cos")
public class CosProperties {
    private String bucket;
    private String region;
    private String domain;
    private String secretId;
    private String secretKey;
    private String playbackProxyBaseUrl;
    private Long uploadExpireSeconds = 3600L;
    private Long maxUploadBytes = 2147483648L;

    public String getBucket() {
        return bucket;
    }

    public void setBucket(String bucket) {
        this.bucket = bucket;
    }

    public String getRegion() {
        return region;
    }

    public void setRegion(String region) {
        this.region = region;
    }

    public String getDomain() {
        return domain;
    }

    public void setDomain(String domain) {
        this.domain = domain;
    }

    public String getSecretId() {
        return secretId;
    }

    public void setSecretId(String secretId) {
        this.secretId = secretId;
    }

    public String getSecretKey() {
        return secretKey;
    }

    public void setSecretKey(String secretKey) {
        this.secretKey = secretKey;
    }

    public String getPlaybackProxyBaseUrl() {
        return playbackProxyBaseUrl;
    }

    public void setPlaybackProxyBaseUrl(String playbackProxyBaseUrl) {
        this.playbackProxyBaseUrl = playbackProxyBaseUrl;
    }

    public Long getUploadExpireSeconds() {
        return uploadExpireSeconds;
    }

    public void setUploadExpireSeconds(Long uploadExpireSeconds) {
        this.uploadExpireSeconds = uploadExpireSeconds;
    }

    public Long getMaxUploadBytes() {
        return maxUploadBytes;
    }

    public void setMaxUploadBytes(Long maxUploadBytes) {
        this.maxUploadBytes = maxUploadBytes;
    }
}
