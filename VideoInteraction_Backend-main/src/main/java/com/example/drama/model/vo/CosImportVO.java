package com.example.drama.model.vo;

import lombok.Data;

import java.util.List;

@Data
public class CosImportVO {
    private Long batchId;
    private Long dramaId;
    private String status;
    private List<Long> assetIds;
    private List<Long> episodeIds;
}
