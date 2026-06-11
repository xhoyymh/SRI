#!/usr/bin/env python3
# 本地视频静态服务（支持 HTTP Range，可拖动进度条）
# 用法：在项目根目录执行  python3 serve-video.py
# 服务目录：miniprogram/static/video  端口：8000
# 微信 <video> 指向 http://localhost:8000/episode-01.mp4
import http.server
import os
import re
import socketserver

PORT = 8000
VIDEO_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                         "miniprogram", "static", "video")


class RangeHandler(http.server.SimpleHTTPRequestHandler):
    """支持 Range 请求的处理器，视频拖动/快进必需。"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=VIDEO_DIR, **kwargs)

    def end_headers(self):
        # 允许任意来源（开发者工具/真机调试方便）
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def do_GET(self):
        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            self.send_error(404, "File not found")
            return

        file_size = os.path.getsize(path)
        range_header = self.headers.get("Range")

        if range_header is None:
            # 普通完整请求
            start, end = 0, file_size - 1
            self.send_response(200)
            self.send_header("Content-Type", self.guess_type(path))
            self.send_header("Content-Length", str(file_size))
            self.end_headers()
        else:
            # 解析 Range: bytes=start-end
            m = re.match(r"bytes=(\d*)-(\d*)", range_header)
            start = int(m.group(1)) if m.group(1) else 0
            end = int(m.group(2)) if m.group(2) else file_size - 1
            end = min(end, file_size - 1)
            self.send_response(206)
            self.send_header("Content-Type", self.guess_type(path))
            self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
            self.send_header("Content-Length", str(end - start + 1))
            self.end_headers()

        # 写文件内容；播放器中途断开（拖动/暂停/重发 Range）会触发 BrokenPipe，静默忽略
        try:
            with open(path, "rb") as f:
                f.seek(start)
                remaining = end - start + 1
                chunk = 64 * 1024
                while remaining > 0:
                    data = f.read(min(chunk, remaining))
                    if not data:
                        break
                    self.wfile.write(data)
                    remaining -= len(data)
        except (BrokenPipeError, ConnectionResetError):
            pass  # 客户端提前断开，正常现象


class ThreadingServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    if not os.path.isdir(VIDEO_DIR):
        raise SystemExit(f"找不到视频目录: {VIDEO_DIR}")
    files = [f for f in os.listdir(VIDEO_DIR) if f.endswith(".mp4")]
    print(f"视频目录: {VIDEO_DIR}")
    print(f"可访问文件: {', '.join(sorted(files)) or '(无 mp4)'}")
    print(f"服务已启动: http://localhost:{PORT}/")
    print(f"示例: http://localhost:{PORT}/episode-01.mp4")
    print("按 Ctrl+C 停止。")
    with ThreadingServer(("0.0.0.0", PORT), RangeHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n已停止。")
