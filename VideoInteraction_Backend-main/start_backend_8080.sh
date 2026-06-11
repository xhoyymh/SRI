#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
java @target/run-backend.args --spring.profiles.active=local
