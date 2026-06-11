package com.example.drama.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;

@Service
public class SecretCryptoService {
    private static final int IV_LENGTH = 12;
    private static final int TAG_LENGTH = 128;
    private final byte[] keyBytes;
    private final SecureRandom secureRandom = new SecureRandom();

    public SecretCryptoService(@Value("${security.secret-key}") String secretKey) {
        this.keyBytes = deriveKey(secretKey == null ? "" : secretKey);
    }

    public String encrypt(String plainText) {
        if (plainText == null || plainText.isBlank()) {
            return null;
        }
        try {
            byte[] iv = new byte[IV_LENGTH];
            secureRandom.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(keyBytes, "AES"), new GCMParameterSpec(TAG_LENGTH, iv));
            byte[] encrypted = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));
            byte[] all = new byte[iv.length + encrypted.length];
            System.arraycopy(iv, 0, all, 0, iv.length);
            System.arraycopy(encrypted, 0, all, iv.length, encrypted.length);
            return Base64.getEncoder().encodeToString(all);
        } catch (Exception e) {
            throw new IllegalStateException("加密模型 API Key 失败", e);
        }
    }

    public String decrypt(String encryptedText) {
        if (encryptedText == null || encryptedText.isBlank()) {
            return null;
        }
        try {
            byte[] all = Base64.getDecoder().decode(encryptedText);
            byte[] iv = Arrays.copyOfRange(all, 0, IV_LENGTH);
            byte[] encrypted = Arrays.copyOfRange(all, IV_LENGTH, all.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(keyBytes, "AES"), new GCMParameterSpec(TAG_LENGTH, iv));
            return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("解密模型 API Key 失败", e);
        }
    }

    private byte[] deriveKey(String secretKey) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return digest.digest(secretKey.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("初始化加密密钥失败", e);
        }
    }
}
