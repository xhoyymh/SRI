package com.example.drama.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.example.drama.model.entity.DramaComment;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface DramaCommentMapper extends BaseMapper<DramaComment> {
}
