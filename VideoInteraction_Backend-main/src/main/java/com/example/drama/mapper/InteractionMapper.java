package com.example.drama.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.example.drama.model.entity.Interaction;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface InteractionMapper extends BaseMapper<Interaction> {
}
