package com.example.drama.service;

import com.example.drama.common.BusinessException;
import com.example.drama.config.CosProperties;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URLEncoder;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class CosPostPolicyService {
    private final CosProperties properties;

    public CosPostPolicyService(CosProperties properties) {
        this.properties = properties;
    }

    public SignedPut buildSignedPut(String objectKey) {
        return buildSignedUrl(objectKey, "PUT");
    }

    public SignedPut buildSignedPost(String objectKey) {
        if (isBlank(properties.getSecretId()) || isBlank(properties.getSecretKey())) {
            throw new BusinessException(5000, "COS SecretId/SecretKey is not configured");
        }
        if (isBlank(objectKey)) {
            throw new BusinessException(4000, "COS objectKey is required");
        }
        long now = Instant.now().getEpochSecond();
        long expire = now + Math.max(60L, properties.getUploadExpireSeconds() == null ? 3600L : properties.getUploadExpireSeconds());
        String keyTime = now + ";" + expire;
        long maxBytes = properties.getMaxUploadBytes() != null && properties.getMaxUploadBytes() > 0
                ? properties.getMaxUploadBytes()
                : 5L * 1024 * 1024 * 1024;

        String policyText = "{\"expiration\":\"" + Instant.ofEpochSecond(expire)
                + "\",\"conditions\":["
                + "{\"bucket\":" + jsonString(properties.getBucket()) + "},"
                + "[\"eq\",\"$key\"," + jsonString(objectKey) + "],"
                + "[\"content-length-range\",0," + maxBytes + "],"
                + "{\"q-sign-algorithm\":\"sha1\"},"
                + "{\"q-ak\":" + jsonString(properties.getSecretId()) + "},"
                + "{\"q-sign-time\":" + jsonString(keyTime) + "}"
                + "]}";
        try {
            String policy = Base64.getEncoder().encodeToString(policyText.getBytes(StandardCharsets.UTF_8));
            String signKey = hmacSha1Hex(properties.getSecretKey(), keyTime);
            String signature = hmacSha1Hex(signKey, sha1Hex(policyText));

            Map<String, String> formData = new LinkedHashMap<>();
            formData.put("key", objectKey);
            formData.put("policy", policy);
            formData.put("q-sign-algorithm", "sha1");
            formData.put("q-ak", properties.getSecretId());
            formData.put("q-key-time", keyTime);
            formData.put("q-signature", signature);

            SignedPut post = new SignedPut();
            post.setUploadMethod("POST");
            post.setUploadUrl("https://" + cosHostName());
            post.setHeaders(Collections.emptyMap());
            post.setFormData(formData);
            post.setExpiresAt(expire);
            return post;
        } catch (Exception e) {
            throw new BusinessException(5000, "Failed to generate COS post policy");
        }
    }

    public void uploadObject(String objectKey, InputStream input, long contentLength, String contentType) {
        SignedPut signedPut = buildSignedPut(objectKey);
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(signedPut.getUploadUrl()).openConnection();
            connection.setRequestMethod("PUT");
            connection.setDoOutput(true);
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(10 * 60 * 1000);
            if (contentLength >= 0) {
                connection.setFixedLengthStreamingMode(contentLength);
            } else {
                connection.setChunkedStreamingMode(1024 * 1024);
            }
            if (!isBlank(contentType)) {
                connection.setRequestProperty("Content-Type", contentType);
            }
            try (OutputStream output = connection.getOutputStream()) {
                input.transferTo(output);
            }

            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                throw new BusinessException(5000, "COS upload failed: HTTP " + status + responseText(connection));
            }
        } catch (BusinessException e) {
            throw e;
        } catch (IOException e) {
            throw new BusinessException(5000, "COS upload failed: " + e.getMessage());
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    public String buildSignedGetUrl(String objectKey) {
        return buildSignedUrl(objectKey, "GET").getUploadUrl();
    }

    public String buildPlayableGetUrl(String objectKey) {
        if (isBlank(properties.getPlaybackProxyBaseUrl())) {
            return buildSignedGetUrl(objectKey);
        }
        String key = normalizeAllowedObjectKey(objectKey);
        return properties.getPlaybackProxyBaseUrl().replaceAll("/+$", "") + "/media/cos?key=" + urlEncode(key);
    }

    public boolean deleteObjectBestEffort(String objectKey) {
        if (isBlank(objectKey)) {
            return false;
        }
        HttpURLConnection connection = null;
        try {
            SignedPut signedDelete = buildSignedUrl(objectKey, "DELETE");
            connection = (HttpURLConnection) new URL(signedDelete.getUploadUrl()).openConnection();
            connection.setRequestMethod("DELETE");
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            int status = connection.getResponseCode();
            return status == 200 || status == 204 || status == 404;
        } catch (Exception ignored) {
            return false;
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    public boolean objectExists(String objectKey) {
        SignedPut signedHead = buildSignedUrl(objectKey, "HEAD");
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(signedHead.getUploadUrl()).openConnection();
            connection.setRequestMethod("HEAD");
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            int status = connection.getResponseCode();
            if (status == 200) {
                return true;
            }
            if (status == 404) {
                return false;
            }
            throw new BusinessException(5000, "COS object check failed: HTTP " + status);
        } catch (BusinessException e) {
            throw e;
        } catch (IOException e) {
            throw new BusinessException(5000, "COS object check failed: " + e.getMessage());
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    public Map<String, Object> buildSdkAuthorization(Map<String, Object> request) {
        if (isBlank(properties.getSecretId()) || isBlank(properties.getSecretKey())) {
            throw new BusinessException(5000, "COS SecretId/SecretKey is not configured");
        }
        if (request == null) {
            throw new BusinessException(4000, "COS authorization request is required");
        }

        String bucket = firstText(request, "Bucket", "bucket");
        String region = firstText(request, "Region", "region");
        if (!properties.getBucket().equals(bucket) || !properties.getRegion().equals(region)) {
            throw new BusinessException(4000, "COS bucket/region is not allowed");
        }

        String method = firstText(request, "Method", "method");
        if (isBlank(method)) {
            method = "GET";
        }
        String key = normalizeObjectKey(firstText(request, "Key", "key"));
        String resourceKey = normalizeObjectKey(firstText(request, "ResourceKey", "resourceKey"));
        String pathname = firstText(request, "Pathname", "pathname");
        if (isBlank(key)) {
            key = keyFromPathname(pathname);
        }
        if (isBlank(key) && !isBlank(resourceKey)) {
            key = resourceKey;
        }
        boolean bucketLevelRequest = isBlank(key) && "/".equals(normalizePathname(pathname, ""));
        if (bucketLevelRequest) {
            ensureAllowedBucketLevelRequest(request);
        } else {
            ensureAllowedUploadKey(key);
        }

        String normalizedPathname = normalizePathname(pathname, key);
        if (!bucketLevelRequest && !keyFromPathname(normalizedPathname).equals(key)) {
            throw new BusinessException(4000, "COS pathname/key mismatch");
        }

        Map<String, String> query = objectToStringMap(firstObject(request, "Query", "query"));
        Map<String, String> headers = signableHeaders(objectToStringMap(firstObject(request, "Headers", "headers")));
        boolean forceSignHost = !Boolean.FALSE.equals(firstObject(request, "ForceSignHost", "forceSignHost"));
        if (forceSignHost && !containsHeader(headers, "host")) {
            headers.put("Host", cosHostName());
        }

        long now = Instant.now().getEpochSecond() - 1;
        long expire = now + Math.max(60L, properties.getUploadExpireSeconds() == null ? 3600L : properties.getUploadExpireSeconds());
        String keyTime = now + ";" + expire;
        try {
            String authorization = buildAuthorization(method, normalizedPathname, query, headers, keyTime);
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("authorization", authorization);
            response.put("startTime", now);
            response.put("expiredTime", expire);
            return response;
        } catch (Exception e) {
            throw new BusinessException(5000, "Failed to generate COS authorization");
        }
    }

    private SignedPut buildSignedUrl(String objectKey, String method) {
        if (isBlank(properties.getSecretId()) || isBlank(properties.getSecretKey())) {
            throw new BusinessException(5000, "COS SecretId/SecretKey is not configured");
        }
        if (isBlank(objectKey)) {
            throw new BusinessException(4000, "COS objectKey is required");
        }
        String normalizedMethod = method == null ? "PUT" : method.toUpperCase(Locale.ROOT);

        long now = Instant.now().getEpochSecond();
        long expire = now + Math.max(60L, properties.getUploadExpireSeconds() == null ? 3600L : properties.getUploadExpireSeconds());
        String keyTime = now + ";" + expire;
        String host = cosHostName();
        String path = "/" + encodePath(objectKey);
        String headerList = "host";
        String urlParamList = "";

        try {
            String httpString = normalizedMethod.toLowerCase(Locale.ROOT) + "\n" + path + "\n\nhost=" + urlEncode(host) + "\n";
            String stringToSign = "sha1\n" + keyTime + "\n" + sha1Hex(httpString) + "\n";
            String signKey = hmacSha1Hex(properties.getSecretKey(), keyTime);
            String signature = hmacSha1Hex(signKey, stringToSign);
            String authQuery = "q-sign-algorithm=sha1"
                    + "&q-ak=" + urlEncode(properties.getSecretId())
                    + "&q-sign-time=" + urlEncode(keyTime)
                    + "&q-key-time=" + urlEncode(keyTime)
                    + "&q-header-list=" + headerList
                    + "&q-url-param-list=" + urlParamList
                    + "&q-signature=" + signature;

            SignedPut put = new SignedPut();
            put.setUploadMethod(normalizedMethod);
            put.setUploadUrl("https://" + host + path + "?" + authQuery);
            put.setHeaders(Collections.emptyMap());
            put.setFormData(Collections.emptyMap());
            put.setExpiresAt(expire);
            return put;
        } catch (Exception e) {
            throw new BusinessException(5000, "Failed to generate COS presigned URL");
        }
    }

    public String publicUrl(String objectKey) {
        return domain().replaceAll("/+$", "") + "/" + encodePath(objectKey);
    }

    public String normalizeAllowedObjectKey(String key) {
        String normalized = normalizeObjectKey(key);
        ensureAllowedUploadKey(normalized);
        return normalized;
    }

    public String bucket() {
        return properties.getBucket();
    }

    public String region() {
        return properties.getRegion();
    }

    public Long maxUploadBytes() {
        return properties.getMaxUploadBytes();
    }

    public String domain() {
        if (!isBlank(properties.getDomain())) {
            return properties.getDomain();
        }
        return cosHost();
    }

    private String cosHost() {
        return "https://" + cosHostName();
    }

    private String cosHostName() {
        return properties.getBucket() + ".cos." + properties.getRegion() + ".myqcloud.com";
    }

    private String buildAuthorization(String method,
                                      String pathname,
                                      Map<String, String> query,
                                      Map<String, String> headers,
                                      String keyTime) throws Exception {
        String normalizedMethod = (method == null ? "GET" : method).toLowerCase(Locale.ROOT);
        String headerList = encodedSortedKeys(headers).toLowerCase(Locale.ROOT);
        String urlParamList = encodedSortedKeys(query).toLowerCase(Locale.ROOT);
        String formatString = normalizedMethod + "\n"
                + pathname + "\n"
                + objectToSignString(query) + "\n"
                + objectToSignString(headers) + "\n";
        String stringToSign = "sha1\n" + keyTime + "\n" + sha1Hex(formatString) + "\n";
        String signKey = hmacSha1Hex(properties.getSecretKey(), keyTime);
        String signature = hmacSha1Hex(signKey, stringToSign);
        return "q-sign-algorithm=sha1"
                + "&q-ak=" + properties.getSecretId()
                + "&q-sign-time=" + keyTime
                + "&q-key-time=" + keyTime
                + "&q-header-list=" + headerList
                + "&q-url-param-list=" + urlParamList
                + "&q-signature=" + signature;
    }

    private String objectToSignString(Map<String, String> values) {
        List<String> keys = sortedKeys(values);
        List<String> pairs = new ArrayList<>();
        for (String key : keys) {
            String value = values.get(key);
            pairs.add(camSafeUrlEncode(key).toLowerCase(Locale.ROOT) + "=" + camSafeUrlEncode(value == null ? "" : value));
        }
        return String.join("&", pairs);
    }

    private String encodedSortedKeys(Map<String, String> values) {
        List<String> encoded = new ArrayList<>();
        for (String key : values.keySet()) {
            encoded.add(camSafeUrlEncode(key).toLowerCase(Locale.ROOT));
        }
        encoded.sort(String::compareTo);
        return String.join(";", encoded);
    }

    private List<String> sortedKeys(Map<String, String> values) {
        List<String> keys = new ArrayList<>(values.keySet());
        keys.sort((a, b) -> a.toLowerCase(Locale.ROOT).compareTo(b.toLowerCase(Locale.ROOT)));
        return keys;
    }

    private Map<String, String> objectToStringMap(Object value) {
        Map<String, String> result = new LinkedHashMap<>();
        if (!(value instanceof Map<?, ?> map)) {
            return result;
        }
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            if (entry.getKey() == null || entry.getValue() == null) {
                continue;
            }
            result.put(String.valueOf(entry.getKey()), String.valueOf(entry.getValue()));
        }
        return result;
    }

    private Map<String, String> signableHeaders(Map<String, String> headers) {
        Map<String, String> result = new LinkedHashMap<>();
        for (Map.Entry<String, String> entry : headers.entrySet()) {
            String key = entry.getKey() == null ? "" : entry.getKey();
            String lower = key.toLowerCase(Locale.ROOT);
            if (entry.getValue() == null || entry.getValue().isBlank()) {
                continue;
            }
            if (lower.startsWith("x-cos-") || lower.startsWith("x-ci-") || isCosSignHeader(lower)) {
                result.put(key, entry.getValue());
            }
        }
        return result;
    }

    private boolean isCosSignHeader(String lower) {
        return List.of(
                "cache-control",
                "content-disposition",
                "content-encoding",
                "content-length",
                "content-md5",
                "content-type",
                "expect",
                "expires",
                "host",
                "if-match",
                "if-modified-since",
                "if-none-match",
                "if-unmodified-since",
                "origin",
                "range",
                "transfer-encoding",
                "pic-operations"
        ).contains(lower);
    }

    private boolean containsHeader(Map<String, String> headers, String name) {
        for (String key : headers.keySet()) {
            if (key != null && key.equalsIgnoreCase(name)) {
                return true;
            }
        }
        return false;
    }

    private Object firstObject(Map<String, Object> request, String first, String second) {
        Object value = request.get(first);
        return value != null ? value : request.get(second);
    }

    private String firstText(Map<String, Object> request, String first, String second) {
        Object value = firstObject(request, first, second);
        return value == null ? null : String.valueOf(value);
    }

    private String normalizePathname(String pathname, String key) {
        String path = isBlank(pathname) ? "/" + key : pathname.trim();
        return path.startsWith("/") ? path : "/" + path;
    }

    private String keyFromPathname(String pathname) {
        if (isBlank(pathname)) {
            return "";
        }
        String path = pathname.trim();
        if (path.startsWith("/")) {
            path = path.substring(1);
        }
        if (path.startsWith(properties.getBucket() + "/")) {
            path = path.substring(properties.getBucket().length() + 1);
        }
        return normalizeObjectKey(path);
    }

    private String normalizeObjectKey(String key) {
        String text = key == null ? "" : key.trim().replace('\\', '/');
        while (text.startsWith("/")) {
            text = text.substring(1);
        }
        return text;
    }

    private void ensureAllowedUploadKey(String key) {
        if (isBlank(key)
                || key.contains("..")
                || key.contains("?")
                || key.contains("#")) {
            throw new BusinessException(4000, "COS objectKey is not allowed");
        }
        if (key.startsWith("uploads/")
                || key.startsWith("generated/")
                || key.startsWith("uploaded_drama/")) {
            return;
        }
        throw new BusinessException(4000, "COS objectKey is not allowed: " + key);
    }

    private void ensureAllowedBucketLevelRequest(Map<String, Object> request) {
        String method = firstText(request, "Method", "method");
        String action = firstText(request, "Action", "action");
        String resourceKey = normalizeObjectKey(firstText(request, "ResourceKey", "resourceKey"));
        Map<String, String> query = objectToStringMap(firstObject(request, "Query", "query"));
        String prefix = normalizeObjectKey(query.get("prefix"));
        String candidate = isBlank(resourceKey) ? prefix : resourceKey;
        boolean allowedMethod = method == null || "GET".equalsIgnoreCase(method) || "HEAD".equalsIgnoreCase(method);
        boolean allowedAction = action == null
                || "name/cos:GetBucket".equals(action)
                || "name/cos:ListMultipartUploads".equals(action)
                || "name/cos:HeadBucket".equals(action);
        if (!allowedMethod || !allowedAction) {
            throw new BusinessException(4000, "COS bucket level authorization is not allowed");
        }
        if (!isBlank(candidate)) {
            ensureAllowedUploadKey(candidate);
        }
    }

    private String encodePath(String objectKey) {
        String[] segments = objectKey.split("/", -1);
        StringBuilder encoded = new StringBuilder();
        for (int i = 0; i < segments.length; i++) {
            if (i > 0) {
                encoded.append('/');
            }
            encoded.append(urlEncode(segments[i]));
        }
        return encoded.toString();
    }

    private String urlEncode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8)
                .replace("+", "%20")
                .replace("*", "%2A")
                .replace("%7E", "~");
    }

    private String camSafeUrlEncode(String value) {
        return urlEncode(value)
                .replace("!", "%21")
                .replace("'", "%27")
                .replace("(", "%28")
                .replace(")", "%29");
    }

    private String jsonString(String value) {
        String text = value == null ? "" : value;
        return "\"" + text
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\b", "\\b")
                .replace("\f", "\\f")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t")
                + "\"";
    }

    private String hmacSha1Hex(String key, String data) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA1");
        mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA1"));
        return toHex(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
    }

    private String sha1Hex(String data) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-1");
        return toHex(digest.digest(data.getBytes(StandardCharsets.UTF_8)));
    }

    private String toHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }

    private String responseText(HttpURLConnection connection) {
        try (InputStream input = connection.getErrorStream() != null
                ? connection.getErrorStream()
                : connection.getInputStream()) {
            String text = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            if (text.isBlank()) {
                return "";
            }
            return ": " + (text.length() > 500 ? text.substring(0, 500) : text);
        } catch (Exception ignored) {
            return "";
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    public static class SignedPut {
        private String uploadMethod;
        private String uploadUrl;
        private Map<String, String> headers;
        private Map<String, String> formData;
        private Long expiresAt;

        public String getUploadMethod() {
            return uploadMethod;
        }

        public void setUploadMethod(String uploadMethod) {
            this.uploadMethod = uploadMethod;
        }

        public String getUploadUrl() {
            return uploadUrl;
        }

        public void setUploadUrl(String uploadUrl) {
            this.uploadUrl = uploadUrl;
        }

        public Map<String, String> getHeaders() {
            return headers;
        }

        public void setHeaders(Map<String, String> headers) {
            this.headers = headers;
        }

        public Map<String, String> getFormData() {
            return formData;
        }

        public void setFormData(Map<String, String> formData) {
            this.formData = formData;
        }

        public Long getExpiresAt() {
            return expiresAt;
        }

        public void setExpiresAt(Long expiresAt) {
            this.expiresAt = expiresAt;
        }
    }
}
