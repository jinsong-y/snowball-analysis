#!/bin/bash
# ============================================================
# 启动 Chrome 并开启远程调试端口 (CDP)
# 用法: ./start-chrome-debug.sh
# ============================================================

PORT=9222
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# 检查 Chrome 是否已在运行
if pgrep -x "Google Chrome" > /dev/null 2>&1; then
  echo "错误: Google Chrome 已在运行。"
  echo "请先关闭 Chrome，然后再运行此脚本。"
  echo "  提示: 可以使用 Cmd+Q 退出 Chrome，或运行: pkill 'Google Chrome'"
  exit 1
fi

# 检查端口是否被占用
if lsof -i :$PORT > /dev/null 2>&1; then
  echo "错误: 端口 $PORT 已被占用。"
  echo "请释放端口后重试: lsof -i :$PORT"
  exit 1
fi

# 检查 Chrome 是否安装
if [ ! -f "$CHROME" ]; then
  echo "错误: 未找到 Google Chrome，请确认已安装。"
  exit 1
fi

echo "正在启动 Chrome (远程调试端口: $PORT)..."
exec "$CHROME" \
  --remote-debugging-port=$PORT \
  --no-first-run \
  --no-default-browser-check \
  --user-data-dir="$HOME/.chrome-debug-profile"
