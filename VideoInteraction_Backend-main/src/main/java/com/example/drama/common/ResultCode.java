package com.example.drama.common;

public enum ResultCode {
    SUCCESS(0, "success"),

    PARAM_VALIDATION_FAILED(1001, "参数校验失败"),
    RESOURCE_NOT_FOUND(1002, "资源不存在"),
    DUPLICATE_OPERATION(1003, "重复操作"),

    INTERNAL_SERVER_ERROR(5000, "服务器内部错误");

    private final Integer code;
    private final String message;

    ResultCode(Integer code, String message) {
        this.code = code;
        this.message = message;
    }

    public Integer getCode() {
        return code;
    }

    public String getMessage() {
        return message;
    }
}
