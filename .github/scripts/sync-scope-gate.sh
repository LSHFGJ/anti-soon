#!/usr/bin/env bash
set -euo pipefail

MODE=""
CHANGED_FILES_FILE=""
OUTPUT_FILE=""
SYNC_CRITICAL=""
FRONTEND_SUITE_RESULT=""
CONTRACTS_SUITE_RESULT=""
WORKFLOW_SUITE_RESULT=""
REPLAY_SUITE_RESULT=""

usage() {
  cat <<'EOF'
Usage:
  sync-scope-gate.sh scope --changed-files-file <path> [--output-file <path>]
  sync-scope-gate.sh suite --sync-critical <true|false> \
    --frontend-suite-result <success|failure|cancelled|skipped> \
    --contracts-suite-result <success|failure|cancelled|skipped> \
    --workflow-suite-result <success|failure|cancelled|skipped> \
    --replay-suite-result <success|failure|cancelled|skipped>
EOF
}

if [ "$#" -lt 1 ]; then
  usage
  exit 2
fi

MODE="$1"
shift

while [ "$#" -gt 0 ]; do
  case "$1" in
    --changed-files-file)
      CHANGED_FILES_FILE="$2"
      shift 2
      ;;
    --output-file)
      OUTPUT_FILE="$2"
      shift 2
      ;;
    --sync-critical)
      SYNC_CRITICAL="$2"
      shift 2
      ;;
    --frontend-suite-result)
      FRONTEND_SUITE_RESULT="$2"
      shift 2
      ;;
    --contracts-suite-result)
      CONTRACTS_SUITE_RESULT="$2"
      shift 2
      ;;
    --workflow-suite-result)
      WORKFLOW_SUITE_RESULT="$2"
      shift 2
      ;;
    --replay-suite-result)
      REPLAY_SUITE_RESULT="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

ALLOWED_PATTERNS=(
  '^frontend/src/hooks/.*$'
  '^frontend/src/lib/oasisUpload\.ts$'
  '^frontend/src/lib/commitRevealRecovery\.ts$'
  '^frontend/src/utils/encryption\.ts$'
  '^frontend/src/__tests__/useCommitReveal-state\.spec\.ts$'
  '^frontend/src/__tests__/usePoCSubmission-queue\.spec\.ts$'
  '^frontend/src/__tests__/encryption\.test\.ts$'
  '^frontend/src/__tests__/oasis-upload\.spec\.ts$'
  '^contracts/src/BountyHub\.sol$'
  '^contracts/test/BountyHub\.t\.sol$'
  '^workflow/verify-poc/.*$'
  '^\.github/workflows/sapphire-sepolia-sync-hardening-gate\.yml$'
  '^\.github/scripts/sync-scope-gate\.sh$'
)

SYNC_CRITICAL_PATTERNS=(
  '^frontend/src/hooks/.*$'
  '^frontend/src/lib/oasisUpload\.ts$'
  '^frontend/src/lib/commitRevealRecovery\.ts$'
  '^frontend/src/utils/encryption\.ts$'
  '^frontend/src/__tests__/useCommitReveal-state\.spec\.ts$'
  '^frontend/src/__tests__/usePoCSubmission-queue\.spec\.ts$'
  '^frontend/src/__tests__/encryption\.test\.ts$'
  '^frontend/src/__tests__/oasis-upload\.spec\.ts$'
  '^contracts/src/BountyHub\.sol$'
  '^contracts/test/BountyHub\.t\.sol$'
  '^workflow/verify-poc/.*$'
)

matches_any_pattern() {
  local file_path="$1"
  shift
  local pattern
  for pattern in "$@"; do
    if [[ "$file_path" =~ $pattern ]]; then
      return 0
    fi
  done
  return 1
}

write_output() {
  local key="$1"
  local value="$2"
  if [ -n "$OUTPUT_FILE" ]; then
    printf '%s=%s\n' "$key" "$value" >> "$OUTPUT_FILE"
  fi
}

run_scope_mode() {
  if [ -z "$CHANGED_FILES_FILE" ]; then
    echo "Missing required --changed-files-file argument for scope mode." >&2
    exit 2
  fi

  if [ ! -f "$CHANGED_FILES_FILE" ]; then
    echo "Changed files list does not exist: $CHANGED_FILES_FILE" >&2
    exit 2
  fi

  local sync_critical_changed="false"
  local violations=()

  while IFS= read -r changed_file || [ -n "$changed_file" ]; do
    if [ -z "$changed_file" ]; then
      continue
    fi

    if matches_any_pattern "$changed_file" "${SYNC_CRITICAL_PATTERNS[@]}"; then
      sync_critical_changed="true"
    fi

    if ! matches_any_pattern "$changed_file" "${ALLOWED_PATTERNS[@]}"; then
      violations+=("$changed_file")
    fi
  done < "$CHANGED_FILES_FILE"

  echo "SYNC_CRITICAL_CHANGED=$sync_critical_changed"
  write_output "sync_critical_changed" "$sync_critical_changed"

  if [ "$sync_critical_changed" = "true" ]; then
    echo "Required suites enabled for sync-critical changes:"
    echo " - frontend sync suite"
    echo " - contracts sync suite"
    echo " - workflow sync suite"
    echo " - replay/failure-matrix: workflow/verify-poc/src/e2eSyncFailureMatrix.test.ts"
  else
    echo "No sync-critical file changes detected."
  fi

  if [ "${#violations[@]}" -gt 0 ]; then
    echo "Scope guard violation: out-of-scope files detected:" >&2
    printf ' - %s\n' "${violations[@]}" >&2
    exit 1
  fi

  echo "Scope guard passed."
}

run_suite_mode() {
  if [ -z "$SYNC_CRITICAL" ] || [ -z "$FRONTEND_SUITE_RESULT" ] || [ -z "$CONTRACTS_SUITE_RESULT" ] || [ -z "$WORKFLOW_SUITE_RESULT" ] || [ -z "$REPLAY_SUITE_RESULT" ]; then
    echo "Missing required suite arguments for suite mode." >&2
    exit 2
  fi

  if [ "$SYNC_CRITICAL" != "true" ]; then
    echo "Suite gate passed: no sync-critical changes."
    exit 0
  fi

  local failed_suites=()
  if [ "$FRONTEND_SUITE_RESULT" != "success" ]; then
    failed_suites+=("frontend:$FRONTEND_SUITE_RESULT")
  fi
  if [ "$CONTRACTS_SUITE_RESULT" != "success" ]; then
    failed_suites+=("contracts:$CONTRACTS_SUITE_RESULT")
  fi
  if [ "$WORKFLOW_SUITE_RESULT" != "success" ]; then
    failed_suites+=("workflow:$WORKFLOW_SUITE_RESULT")
  fi
  if [ "$REPLAY_SUITE_RESULT" != "success" ]; then
    failed_suites+=("replay_failure_matrix:$REPLAY_SUITE_RESULT")
  fi

  if [ "${#failed_suites[@]}" -gt 0 ]; then
    echo "Suite gate failed: sync-critical changes require all sync suites to succeed." >&2
    printf ' - %s\n' "${failed_suites[@]}" >&2
    exit 1
  fi

  echo "Suite gate passed: frontend, contracts, workflow, and replay/failure-matrix suites are mandatory and successful."
}

case "$MODE" in
  scope)
    run_scope_mode
    ;;
  suite)
    run_suite_mode
    ;;
  *)
    echo "Unknown mode: $MODE" >&2
    usage
    exit 2
    ;;
esac
