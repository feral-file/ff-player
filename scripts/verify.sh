#!/usr/bin/env bash

set -euo pipefail

base_ref="${VERIFY_BASE_REF:-origin/main}"

for arg in "$@"; do
  case "$arg" in
    --base=*)
      base_ref="${arg#*=}"
      ;;
    *)
      base_ref="$arg"
      ;;
  esac
done

echo "Verifying repository against $base_ref"

npm run lint -- --base="$base_ref"
npm run typecheck
npm run test
npm run build
