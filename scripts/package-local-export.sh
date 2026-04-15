#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/out"
ARTIFACT_DIR="$ROOT_DIR/release"
ARTIFACT_NAME="${1:-ff-player-local-export.tgz}"

cd "$ROOT_DIR"
npm run build

if [[ ! -d "$OUT_DIR" ]]; then
  echo "expected static export directory at $OUT_DIR" >&2
  exit 1
fi

mkdir -p "$ARTIFACT_DIR"
tar -czf "$ARTIFACT_DIR/$ARTIFACT_NAME" -C "$OUT_DIR" .

echo "created $ARTIFACT_DIR/$ARTIFACT_NAME"
