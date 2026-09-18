#!/bin/zsh
# 双击此文件即可启动 Lin Tools 的本地 Web 界面。

set -euo pipefail

PROJECT_DIR="${0:A:h}"
VENV_PYTHON="$PROJECT_DIR/.env/bin/python"
FRONTEND_DIR="$PROJECT_DIR/frontend"
FRONTEND_INDEX="$FRONTEND_DIR/dist/index.html"
APP_PORT="5050"
APP_URL="http://127.0.0.1:$APP_PORT"

cd "$PROJECT_DIR"

if [[ ! -x "$VENV_PYTHON" ]]; then
  echo "正在创建 Python 虚拟环境…"
  command -v python3 >/dev/null || {
    echo "未找到 Python 3，请先安装 Python 3.10 或更高版本。"
    exit 1
  }
  python3 -m venv .env
  "$VENV_PYTHON" -m pip install -e .
fi

if [[ ! -f "$FRONTEND_INDEX" ]] || \
   [[ -n "$(find "$FRONTEND_DIR/src" -type f -newer "$FRONTEND_INDEX" -print -quit)" ]]; then
  command -v npm >/dev/null || {
    echo "未找到 npm，请先安装 Node.js。"
    exit 1
  }

  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    echo "正在安装前端依赖（仅首次需要）…"
    (cd "$FRONTEND_DIR" && npm ci)
  fi

  echo "正在构建前端…"
  (cd "$FRONTEND_DIR" && npm run build)
fi

echo "正在启动 Lin Tools：$APP_URL"
LIN_TOOLS_PORT="$APP_PORT" "$VENV_PYTHON" run_web.py &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT INT TERM

for _ in {1..30}; do
  if curl --silent --fail "$APP_URL" >/dev/null 2>&1; then
    open "$APP_URL"
    wait "$SERVER_PID"
    exit $?
  fi
  sleep 0.5
done

echo "服务未能在 15 秒内启动，请检查上方输出。"
exit 1
