#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TEST_FILES=()
while IFS= read -r test_file; do
  TEST_FILES+=("$test_file")
done < <(find "$ROOT_DIR/src" -type f -name "*.test.ts" | sort)

if [[ ${#TEST_FILES[@]} -eq 0 ]]; then
  echo "No test files found."
  exit 1
fi

for test_file in "${TEST_FILES[@]}"; do
  echo "Running: ${test_file#$ROOT_DIR/}"
  npx ts-node --files "$test_file"
  echo "Passed: ${test_file#$ROOT_DIR/}"
  echo ""
done
