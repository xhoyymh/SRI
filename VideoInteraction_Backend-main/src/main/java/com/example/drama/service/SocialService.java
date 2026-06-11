package com.example.drama.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.example.drama.common.BusinessException;
import com.example.drama.mapper.DramaCommentMapper;
import com.example.drama.mapper.DramaMapper;
import com.example.drama.mapper.DramaSocialActionMapper;
import com.example.drama.mapper.EpisodeMapper;
import com.example.drama.model.dto.DramaCommentRequest;
import com.example.drama.model.dto.SocialMigrationRequest;
import com.example.drama.model.entity.Drama;
import com.example.drama.model.entity.DramaComment;
import com.example.drama.model.entity.DramaSocialAction;
import com.example.drama.model.entity.Episode;
import com.example.drama.model.entity.UserAccount;
import com.example.drama.model.vo.DramaCommentItemVO;
import com.example.drama.model.vo.DramaCommentListVO;
import com.example.drama.model.vo.DramaSocialListVO;
import com.example.drama.model.vo.DramaSocialVO;
import com.example.drama.model.vo.DramaVO;
import com.example.drama.model.vo.SocialMigrationVO;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class SocialService {
    private static final String LIKE = "LIKE";
    private static final String FAVORITE = "FAVORITE";

    private final DramaSocialActionMapper actionMapper;
    private final DramaCommentMapper commentMapper;
    private final DramaMapper dramaMapper;
    private final EpisodeMapper episodeMapper;

    public SocialService(DramaSocialActionMapper actionMapper,
                         DramaCommentMapper commentMapper,
                         DramaMapper dramaMapper,
                         EpisodeMapper episodeMapper) {
        this.actionMapper = actionMapper;
        this.commentMapper = commentMapper;
        this.dramaMapper = dramaMapper;
        this.episodeMapper = episodeMapper;
    }

    public DramaSocialVO getSocial(Long dramaId, UserAccount user) {
        ensureDramaExists(dramaId);
        Long userId = user == null ? null : user.getId();
        DramaSocialVO vo = new DramaSocialVO();
        vo.setDramaId(dramaId);
        vo.setLiked(userId != null && hasAction(userId, dramaId, LIKE));
        vo.setFavorited(userId != null && hasAction(userId, dramaId, FAVORITE));
        vo.setLikeCount(countAction(dramaId, LIKE));
        vo.setFavoriteCount(countAction(dramaId, FAVORITE));
        vo.setCommentCount(commentMapper.selectCount(new LambdaQueryWrapper<DramaComment>()
                .eq(DramaComment::getDramaId, dramaId)));
        return vo;
    }

    @Transactional
    public DramaSocialVO like(Long dramaId, UserAccount user) {
        ensureAction(user, dramaId, LIKE);
        return getSocial(dramaId, user);
    }

    @Transactional
    public DramaSocialVO unlike(Long dramaId, UserAccount user) {
        actionMapper.delete(new LambdaQueryWrapper<DramaSocialAction>()
                .eq(DramaSocialAction::getUserId, user.getId())
                .eq(DramaSocialAction::getDramaId, dramaId)
                .eq(DramaSocialAction::getActionType, LIKE));
        return getSocial(dramaId, user);
    }

    @Transactional
    public DramaSocialVO favorite(Long dramaId, UserAccount user) {
        ensureAction(user, dramaId, FAVORITE);
        return getSocial(dramaId, user);
    }

    @Transactional
    public DramaSocialVO unfavorite(Long dramaId, UserAccount user) {
        actionMapper.delete(new LambdaQueryWrapper<DramaSocialAction>()
                .eq(DramaSocialAction::getUserId, user.getId())
                .eq(DramaSocialAction::getDramaId, dramaId)
                .eq(DramaSocialAction::getActionType, FAVORITE));
        return getSocial(dramaId, user);
    }

    public DramaCommentListVO listComments(Long dramaId, long page, long size) {
        ensureDramaExists(dramaId);
        Page<DramaComment> pageReq = new Page<>(Math.max(1, page), Math.max(1, Math.min(50, size)));
        Page<DramaComment> result = commentMapper.selectPage(pageReq, new LambdaQueryWrapper<DramaComment>()
                .eq(DramaComment::getDramaId, dramaId)
                .orderByDesc(DramaComment::getCreateTime)
                .orderByDesc(DramaComment::getId));
        DramaCommentListVO vo = new DramaCommentListVO();
        vo.setTotal(result.getTotal());
        vo.setList(result.getRecords().stream().map(this::toCommentVO).collect(Collectors.toList()));
        return vo;
    }

    @Transactional
    public DramaCommentItemVO addComment(Long dramaId, UserAccount user, DramaCommentRequest request) {
        ensureDramaExists(dramaId);
        String content = normalizeContent(request.getContent(), 500, "请输入评论内容");
        String clientCommentId = normalizeClientId(request.getClientCommentId());
        if (clientCommentId != null) {
            DramaComment existing = findCommentByClientId(user.getId(), clientCommentId);
            if (existing != null) return toCommentVO(existing);
        }
        DramaComment comment = new DramaComment();
        comment.setDramaId(dramaId);
        comment.setUserId(user.getId());
        comment.setDeviceId(request.getDeviceId());
        comment.setNickname(user.getUsername());
        comment.setContent(content);
        comment.setClientCommentId(clientCommentId);
        comment.setCreateTime(LocalDateTime.now());
        try {
            commentMapper.insert(comment);
        } catch (DuplicateKeyException e) {
            DramaComment existing = clientCommentId == null ? null : findCommentByClientId(user.getId(), clientCommentId);
            if (existing != null) return toCommentVO(existing);
            throw e;
        }
        return toCommentVO(comment);
    }

    public DramaSocialListVO mySocial(UserAccount user) {
        DramaSocialListVO vo = new DramaSocialListVO();
        vo.setLiked(listActionDramas(user.getId(), LIKE));
        vo.setFavorites(listActionDramas(user.getId(), FAVORITE));
        return vo;
    }

    @Transactional
    public SocialMigrationVO migrate(UserAccount user, SocialMigrationRequest request) {
        int likes = 0;
        int favorites = 0;
        int comments = 0;
        for (Long dramaId : distinctIds(request.getLikedDramaIds())) {
            likes += ensureAction(user, dramaId, LIKE) ? 1 : 0;
        }
        for (Long dramaId : distinctIds(request.getFavoriteDramaIds())) {
            favorites += ensureAction(user, dramaId, FAVORITE) ? 1 : 0;
        }
        for (SocialMigrationRequest.CommentItem item : request.getComments() == null ? List.<SocialMigrationRequest.CommentItem>of() : request.getComments()) {
            if (item == null || item.getDramaId() == null) continue;
            String content = normalizeOptionalContent(item.getContent(), 500);
            if (content == null) continue;
            String clientCommentId = normalizeClientId(item.getClientCommentId());
            if (clientCommentId != null && findCommentByClientId(user.getId(), clientCommentId) != null) continue;
            ensureDramaExists(item.getDramaId());
            DramaComment comment = new DramaComment();
            comment.setDramaId(item.getDramaId());
            comment.setUserId(user.getId());
            comment.setNickname(user.getUsername());
            comment.setContent(content);
            comment.setClientCommentId(clientCommentId);
            comment.setCreateTime(toLocalTime(item.getCreatedAt()));
            try {
                commentMapper.insert(comment);
                comments += 1;
            } catch (DuplicateKeyException ignored) {
                // Migration is idempotent; duplicate client ids are considered already migrated.
            }
        }
        SocialMigrationVO vo = new SocialMigrationVO();
        vo.setMigratedLikes(likes);
        vo.setMigratedFavorites(favorites);
        vo.setMigratedComments(comments);
        return vo;
    }

    private boolean ensureAction(UserAccount user, Long dramaId, String actionType) {
        ensureDramaExists(dramaId);
        if (hasAction(user.getId(), dramaId, actionType)) return false;
        LocalDateTime now = LocalDateTime.now();
        DramaSocialAction action = new DramaSocialAction();
        action.setUserId(user.getId());
        action.setDramaId(dramaId);
        action.setActionType(actionType);
        action.setCreateTime(now);
        action.setUpdateTime(now);
        try {
            actionMapper.insert(action);
            return true;
        } catch (DuplicateKeyException ignored) {
            return false;
        }
    }

    private boolean hasAction(Long userId, Long dramaId, String actionType) {
        return actionMapper.selectCount(new LambdaQueryWrapper<DramaSocialAction>()
                .eq(DramaSocialAction::getUserId, userId)
                .eq(DramaSocialAction::getDramaId, dramaId)
                .eq(DramaSocialAction::getActionType, actionType)) > 0;
    }

    private Long countAction(Long dramaId, String actionType) {
        return actionMapper.selectCount(new LambdaQueryWrapper<DramaSocialAction>()
                .eq(DramaSocialAction::getDramaId, dramaId)
                .eq(DramaSocialAction::getActionType, actionType));
    }

    private List<DramaVO> listActionDramas(Long userId, String actionType) {
        List<DramaSocialAction> actions = actionMapper.selectList(new LambdaQueryWrapper<DramaSocialAction>()
                .eq(DramaSocialAction::getUserId, userId)
                .eq(DramaSocialAction::getActionType, actionType)
                .orderByDesc(DramaSocialAction::getUpdateTime)
                .orderByDesc(DramaSocialAction::getId));
        List<Long> ids = actions.stream().map(DramaSocialAction::getDramaId).distinct().collect(Collectors.toList());
        if (ids.isEmpty()) return new ArrayList<>();
        List<Drama> dramas = dramaMapper.selectBatchIds(ids);
        return ids.stream()
                .map(id -> dramas.stream().filter(d -> id.equals(d.getId())).findFirst().orElse(null))
                .filter(d -> d != null)
                .map(this::toDramaVO)
                .collect(Collectors.toList());
    }

    private DramaVO toDramaVO(Drama drama) {
        DramaVO vo = new DramaVO();
        vo.setDramaId(drama.getId());
        vo.setTitle(drama.getTitle());
        vo.setDescription(drama.getDescription());
        vo.setCoverUrl(drama.getCoverUrl());
        if (drama.getTags() != null && !drama.getTags().isBlank()) {
            vo.setTags(Arrays.asList(drama.getTags().split("[,，、\\s]+")));
        }
        vo.setEpisodeCount(Math.toIntExact(episodeMapper.selectCount(new LambdaQueryWrapper<Episode>()
                .eq(Episode::getDramaId, drama.getId()))));
        return vo;
    }

    private DramaCommentItemVO toCommentVO(DramaComment comment) {
        DramaCommentItemVO vo = new DramaCommentItemVO();
        vo.setCommentId(comment.getId());
        vo.setNickname(comment.getNickname());
        vo.setContent(comment.getContent());
        vo.setCreateTime(comment.getCreateTime());
        return vo;
    }

    private DramaComment findCommentByClientId(Long userId, String clientCommentId) {
        return commentMapper.selectOne(new LambdaQueryWrapper<DramaComment>()
                .eq(DramaComment::getUserId, userId)
                .eq(DramaComment::getClientCommentId, clientCommentId)
                .last("LIMIT 1"));
    }

    private void ensureDramaExists(Long dramaId) {
        if (dramaId == null || dramaMapper.selectById(dramaId) == null) {
            throw new BusinessException(1002, "短剧不存在");
        }
    }

    private String normalizeContent(String content, int maxLength, String emptyMessage) {
        String value = normalizeOptionalContent(content, maxLength);
        if (value == null) throw new BusinessException(1001, emptyMessage);
        return value;
    }

    private String normalizeOptionalContent(String content, int maxLength) {
        String value = content == null ? "" : content.trim();
        if (value.isEmpty()) return null;
        return value.length() > maxLength ? value.substring(0, maxLength) : value;
    }

    private String normalizeClientId(String clientId) {
        String value = clientId == null ? "" : clientId.trim();
        return value.isEmpty() ? null : value.substring(0, Math.min(64, value.length()));
    }

    private Set<Long> distinctIds(List<Long> ids) {
        return ids == null ? Set.of() : ids.stream()
                .filter(id -> id != null && id > 0)
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private LocalDateTime toLocalTime(Long epochMillis) {
        if (epochMillis == null || epochMillis <= 0) return LocalDateTime.now();
        return LocalDateTime.ofInstant(Instant.ofEpochMilli(epochMillis), ZoneId.systemDefault());
    }
}
