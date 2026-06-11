package com.example.drama.service;

import com.example.drama.common.BusinessException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@Service
public class MediaProxyService {
    private static final int CONNECT_TIMEOUT_MS = 15000;
    private static final int READ_TIMEOUT_MS = 10 * 60 * 1000;

    private final CosPostPolicyService cosPostPolicyService;

    public MediaProxyService(CosPostPolicyService cosPostPolicyService) {
        this.cosPostPolicyService = cosPostPolicyService;
    }

    public ResponseEntity<StreamingResponseBody> proxyCosObject(String objectKey, String rangeHeader) {
        String key = cosPostPolicyService.normalizeAllowedObjectKey(objectKey);
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(cosPostPolicyService.buildSignedGetUrl(key)).openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            if (isValidRange(rangeHeader)) {
                connection.setRequestProperty(HttpHeaders.RANGE, rangeHeader);
            }

            int status = connection.getResponseCode();
            InputStream input = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            if (input == null) {
                connection.disconnect();
                throw new BusinessException(status, "COS media proxy failed");
            }

            HttpURLConnection activeConnection = connection;
            StreamingResponseBody body = output -> {
                try (InputStream in = input) {
                    in.transferTo(output);
                } finally {
                    activeConnection.disconnect();
                }
            };

            HttpHeaders headers = buildResponseHeaders(activeConnection);
            return ResponseEntity.status(HttpStatusCode.valueOf(status)).headers(headers).body(body);
        } catch (BusinessException e) {
            if (connection != null) {
                connection.disconnect();
            }
            throw e;
        } catch (Exception e) {
            if (connection != null) {
                connection.disconnect();
            }
            throw new BusinessException(5000, "COS media proxy failed: " + e.getMessage());
        }
    }

    private HttpHeaders buildResponseHeaders(HttpURLConnection connection) {
        HttpHeaders headers = new HttpHeaders();
        String contentType = connection.getContentType();
        if (contentType != null && !contentType.isBlank()) {
            headers.set(HttpHeaders.CONTENT_TYPE, contentType);
        } else {
            headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);
        }
        String contentLength = connection.getHeaderField(HttpHeaders.CONTENT_LENGTH);
        if (contentLength != null && !contentLength.isBlank()) {
            headers.set(HttpHeaders.CONTENT_LENGTH, contentLength);
        }
        copyHeader(connection, headers, HttpHeaders.CONTENT_RANGE);
        copyHeader(connection, headers, HttpHeaders.ACCEPT_RANGES);
        headers.set(HttpHeaders.CONTENT_DISPOSITION, "inline");
        headers.setCacheControl(CacheControl.noStore());
        return headers;
    }

    private void copyHeader(HttpURLConnection connection, HttpHeaders headers, String name) {
        String value = connection.getHeaderField(name);
        if (value != null && !value.isBlank()) {
            headers.set(name, value);
        }
    }

    private boolean isValidRange(String rangeHeader) {
        return rangeHeader != null && rangeHeader.startsWith("bytes=");
    }
}
