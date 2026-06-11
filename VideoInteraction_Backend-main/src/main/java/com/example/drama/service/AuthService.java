package com.example.drama.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.example.drama.common.BusinessException;
import com.example.drama.mapper.UserAccountMapper;
import com.example.drama.mapper.UserSessionMapper;
import com.example.drama.model.dto.AuthRequest;
import com.example.drama.model.entity.UserAccount;
import com.example.drama.model.entity.UserSession;
import com.example.drama.model.vo.AuthVO;
import com.example.drama.model.vo.UserVO;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;

@Service
public class AuthService {
    private static final int TOKEN_BYTES = 32;
    private static final int SESSION_DAYS = 30;

    private final UserAccountMapper userAccountMapper;
    private final UserSessionMapper userSessionMapper;
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    private final SecureRandom secureRandom = new SecureRandom();

    public AuthService(UserAccountMapper userAccountMapper, UserSessionMapper userSessionMapper) {
        this.userAccountMapper = userAccountMapper;
        this.userSessionMapper = userSessionMapper;
    }

    @Transactional
    public AuthVO register(AuthRequest request) {
        String username = normalizeUsername(request.getUsername());
        String password = request.getPassword() == null ? "" : request.getPassword();
        if (username.isEmpty() || password.isEmpty()) {
            throw new BusinessException(1001, "请输入用户名和密码");
        }
        if (findByUsername(username) != null) {
            throw new BusinessException(1003, "账号已存在");
        }

        LocalDateTime now = LocalDateTime.now();
        UserAccount user = new UserAccount();
        user.setUsername(username);
        user.setPasswordHash(passwordEncoder.encode(password));
        user.setCreateTime(now);
        user.setUpdateTime(now);
        user.setLastLoginTime(now);
        try {
            userAccountMapper.insert(user);
        } catch (DuplicateKeyException e) {
            throw new BusinessException(1003, "账号已存在");
        }
        return createSession(user, request.getDeviceId());
    }

    @Transactional
    public AuthVO login(AuthRequest request) {
        String username = normalizeUsername(request.getUsername());
        UserAccount user = findByUsername(username);
        if (user == null || !passwordEncoder.matches(request.getPassword() == null ? "" : request.getPassword(), user.getPasswordHash())) {
            throw new BusinessException(1001, "账号或密码不正确");
        }
        user.setLastLoginTime(LocalDateTime.now());
        user.setUpdateTime(LocalDateTime.now());
        userAccountMapper.updateById(user);
        return createSession(user, request.getDeviceId());
    }

    @Transactional
    public void logout(String authorization) {
        String tokenHash = tokenHashFromHeader(authorization);
        if (tokenHash == null) return;
        userSessionMapper.delete(new LambdaQueryWrapper<UserSession>().eq(UserSession::getTokenHash, tokenHash));
    }

    public UserAccount requireUser(String authorization) {
        UserAccount user = resolveUser(authorization);
        if (user == null) {
            throw new BusinessException(401, "请先登录");
        }
        return user;
    }

    public UserAccount resolveUser(String authorization) {
        String tokenHash = tokenHashFromHeader(authorization);
        if (tokenHash == null) return null;

        UserSession session = userSessionMapper.selectOne(new LambdaQueryWrapper<UserSession>()
                .eq(UserSession::getTokenHash, tokenHash)
                .gt(UserSession::getExpireTime, LocalDateTime.now())
                .last("LIMIT 1"));
        if (session == null) return null;
        return userAccountMapper.selectById(session.getUserId());
    }

    public UserVO toVO(UserAccount user) {
        if (user == null) return null;
        UserVO vo = new UserVO();
        vo.setUserId(user.getId());
        vo.setUsername(user.getUsername());
        vo.setCreatedAt(user.getCreateTime());
        return vo;
    }

    private AuthVO createSession(UserAccount user, String deviceId) {
        String token = generateToken();
        LocalDateTime now = LocalDateTime.now();
        UserSession session = new UserSession();
        session.setUserId(user.getId());
        session.setTokenHash(sha256Hex(token));
        session.setDeviceId(deviceId);
        session.setCreateTime(now);
        session.setExpireTime(now.plusDays(SESSION_DAYS));
        userSessionMapper.insert(session);

        AuthVO vo = new AuthVO();
        vo.setToken(token);
        vo.setUser(toVO(user));
        return vo;
    }

    private UserAccount findByUsername(String username) {
        return userAccountMapper.selectOne(new LambdaQueryWrapper<UserAccount>()
                .eq(UserAccount::getUsername, username)
                .last("LIMIT 1"));
    }

    private String normalizeUsername(String username) {
        return username == null ? "" : username.trim();
    }

    private String generateToken() {
        byte[] bytes = new byte[TOKEN_BYTES];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String tokenHashFromHeader(String authorization) {
        if (authorization == null || authorization.isBlank()) return null;
        String value = authorization.trim();
        if (value.regionMatches(true, 0, "Bearer ", 0, 7)) {
            value = value.substring(7).trim();
        }
        return value.isEmpty() ? null : sha256Hex(value);
    }

    private String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashed = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder out = new StringBuilder();
            for (byte b : hashed) out.append(String.format("%02x", b));
            return out.toString();
        } catch (Exception e) {
            throw new BusinessException(5000, "Token hash failed");
        }
    }
}
