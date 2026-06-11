package com.example.drama.controller;

import com.example.drama.service.MediaProxyService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@RestController
@RequestMapping("/media")
@Tag(name = "媒体代理")
public class MediaProxyController {
    private final MediaProxyService mediaProxyService;

    public MediaProxyController(MediaProxyService mediaProxyService) {
        this.mediaProxyService = mediaProxyService;
    }

    @GetMapping("/cos")
    @Operation(summary = "代理 COS 视频播放")
    public ResponseEntity<StreamingResponseBody> proxyCosObject(@RequestParam("key") String key,
                                                                @RequestHeader(value = HttpHeaders.RANGE, required = false) String range) {
        return mediaProxyService.proxyCosObject(key, range);
    }
}
