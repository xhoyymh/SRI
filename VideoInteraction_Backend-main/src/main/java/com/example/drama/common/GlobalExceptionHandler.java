package com.example.drama.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ApiResponse<Void> handleValidationException(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
                .map(FieldError::getDefaultMessage)
                .collect(Collectors.joining("; "));
        log.warn("参数校验失败: {}", message);
        return ApiResponse.error(ResultCode.PARAM_VALIDATION_FAILED);
    }

    @ExceptionHandler(BindException.class)
    public ApiResponse<Void> handleBindException(BindException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
                .map(FieldError::getDefaultMessage)
                .collect(Collectors.joining("; "));
        log.warn("参数绑定失败: {}", message);
        return ApiResponse.error(ResultCode.PARAM_VALIDATION_FAILED);
    }

    @ExceptionHandler(BusinessException.class)
    public ApiResponse<Void> handleBusinessException(BusinessException e) {
        log.warn("业务异常: code={}, message={}", e.getCode(), e.getMessage());
        return ApiResponse.error(e.getCode(), e.getMessage());
    }

    @ExceptionHandler(MissingServletRequestPartException.class)
    public ApiResponse<Void> handleMissingPart(MissingServletRequestPartException e) {
        log.warn("缺少上传文件: {}", e.getRequestPartName());
        return ApiResponse.error(ResultCode.PARAM_VALIDATION_FAILED.getCode(), "缺少上传文件");
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ApiResponse<Void> handleMaxUploadSize(MaxUploadSizeExceededException e) {
        log.warn("上传文件超过限制", e);
        return ApiResponse.error(4000, "视频超过上传大小限制");
    }

    @ExceptionHandler(MultipartException.class)
    public ApiResponse<Void> handleMultipart(MultipartException e) {
        log.warn("上传文件请求无效", e);
        return ApiResponse.error(ResultCode.PARAM_VALIDATION_FAILED.getCode(), "上传文件请求无效");
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ApiResponse<Void> handleMethodNotSupported(HttpRequestMethodNotSupportedException e) {
        log.warn("请求方法不支持: {}", e.getMethod());
        return ApiResponse.error(405, "接口请求方法不支持");
    }

    @ExceptionHandler(Exception.class)
    public ApiResponse<Void> handleException(Exception e) {
        log.error("服务器内部错误", e);
        String detail = e.getClass().getSimpleName();
        if (e.getMessage() != null && !e.getMessage().isBlank()) {
            detail += ": " + e.getMessage();
        }
        return ApiResponse.error(ResultCode.INTERNAL_SERVER_ERROR.getCode(), "服务器内部错误：" + detail);
    }
}
