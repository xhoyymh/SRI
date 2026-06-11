#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ -x ".venv/bin/python" ]; then
  PYTHON=".venv/bin/python"
else
  PYTHON="python3"
fi

"$PYTHON" rag_service.py --host 127.0.0.1 --port 8091
