#!/usr/bin/env bash
set -euo pipefail

MODE=""
CHANGED_FILES_FILE=""
OUTPUT_FILE=""

usage() {
  cat <<'EOF'
Usage:
  docs-scope-gate.sh scope --changed-files-file <path> [--output-file <path>]
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
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

DOCS_ALLOWED_PATTERNS=(
  '^README\.md$'
  '^\.github/workflows/docs-scope-quality-gate\.yml$'
  '^frontend/package\.json$'
  '^frontend/playwright\.config\.ts$'
  '^frontend/test-setup-bun\.ts$'
  '^frontend/tooling/.*$'
  '^frontend/src/App\.tsx$'
  '^frontend/src/config\.ts$'
  '^frontend/src/lib/docsPolicy\.ts$'
  '^frontend/src/lib/oasisUpload\.ts$'
  '^frontend/src/hooks/useCommitReveal\.ts$'
  '^frontend/src/hooks/usePoCBuilder\.ts$'
  '^frontend/src/hooks/usePoCSubmission\.ts$'
  '^frontend/src/hooks/useWallet\.ts$'
  '^frontend/src/pages/Docs\.tsx$'
  '^frontend/src/pages/Builder\.tsx$'
  '^frontend/src/pages/SubmissionDetail\.tsx$'
  '^frontend/src/pages/builderProjectResolution\.ts$'
  '^frontend/src/reference/content/.*$'
  '^frontend/src/test/utils\.tsx$'
  '^frontend/src/components/Layout/Navbar\.tsx$'
  '^frontend/src/components/CodeEditor/index\.tsx$'
  '^frontend/src/components/PoCBuilder/index\.tsx$'
  '^frontend/src/components/PoCBuilder/Steps/.*$'
  '^frontend/src/components/StepGuidance/.*$'
  '^frontend/src/components/shared/(CountdownTimer|Timeline|submissionTimeline)\.tsx?$'
  '^frontend/src/components/ui/.*$'
  '^frontend/src/__tests__/App\.docs-route\.spec\.tsx$'
  '^frontend/src/__tests__/Docs\.test\.tsx$'
  '^frontend/src/__tests__/builder-default-project-context\.spec\.tsx$'
  '^frontend/src/__tests__/builder-project-resolution\.spec\.ts$'
  '^frontend/src/__tests__/docs-authoring-contract\.spec\.ts$'
  '^frontend/src/__tests__/docs-content\.spec\.ts$'
  '^frontend/src/__tests__/docs-policy\.spec\.ts$'
  '^frontend/src/__tests__/navbar-chain-indicator\.spec\.tsx$'
  '^frontend/src/__tests__/e2e/docs-route-shells\.spec\.ts$'
  '^frontend/src/__tests__/e2e/navbar-mobile\.spec\.ts$'
  '^frontend/src/__tests__/e2e/page-shells\.spec\.ts$'
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

  local docs_related_changed="false"
  local violations=()

  while IFS= read -r changed_file || [ -n "$changed_file" ]; do
    if [ -z "$changed_file" ]; then
      continue
    fi

    if matches_any_pattern "$changed_file" "${DOCS_ALLOWED_PATTERNS[@]}"; then
      docs_related_changed="true"
      continue
    fi

    violations+=("$changed_file")
  done < "$CHANGED_FILES_FILE"

  echo "DOCS_RELATED_CHANGED=$docs_related_changed"
  write_output "docs_related_changed" "$docs_related_changed"

  if [ "$docs_related_changed" != "true" ]; then
    echo "No docs-related file changes detected."
    echo "Docs scope gate passed."
    return 0
  fi

  if [ "${#violations[@]}" -gt 0 ]; then
    echo "Docs scope violation: non-docs files detected in docs rollout PR:" >&2
    printf ' - %s\n' "${violations[@]}" >&2
    exit 1
  fi

  echo "Docs scope gate passed."
}

case "$MODE" in
  scope)
    run_scope_mode
    ;;
  *)
    echo "Unknown mode: $MODE" >&2
    usage
    exit 2
    ;;
esac
