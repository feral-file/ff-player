#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

fix_mode=false
base_ref="origin/main"

for arg in "$@"; do
  case "$arg" in
    --fix)
      fix_mode=true
      ;;
    --base=*)
      base_ref="${arg#*=}"
      ;;
    *)
      base_ref="$arg"
      ;;
  esac
done

merge_base="$(git merge-base "$base_ref" HEAD)"

changed_files=()
while IFS= read -r -d '' file; do
  changed_files+=("$file")
done < <(
  git diff --name-only --diff-filter=ACMR -z "$merge_base" -- \
    '*.js' \
    '*.jsx' \
    '*.ts' \
    '*.tsx' \
    '*.mjs' \
    '*.cjs'
)

existing_files=()
for file in "${changed_files[@]}"; do
  if [[ -f "$file" ]]; then
    existing_files+=("$file")
  fi
done

if [[ "${#existing_files[@]}" -eq 0 ]]; then
  echo "No changed JavaScript or TypeScript files to lint against $base_ref."
  exit 0
fi

echo "Linting changed files against $base_ref:"
printf ' - %s\n' "${existing_files[@]}"

if [[ "$fix_mode" == true ]]; then
  npx eslint --fix "${existing_files[@]}"
fi

npx eslint "${existing_files[@]}"
