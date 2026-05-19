#!/usr/bin/env bash
# sync-claude-to-cursor-rules.sh
#
# Mirror .claude/rules/*.md into .cursor/rules/*.mdc with proper YAML
# frontmatter so Cursor treats them as first-class project rules.
#
# Source of truth: .claude/rules/
# Generated: .cursor/rules/  (do not edit by hand)
#
# Per-file activation: by default every rule gets `alwaysApply: true`.
# To override, add a magic comment on the first line of the source file:
#
#   <!-- cursor: globs=src/**/*.ts -->         # auto-attach by glob
#   <!-- cursor: description=Use when X -->    # agent-requested
#   <!-- cursor: manual -->                    # only on @-mention
#   <!-- cursor: alwaysApply=false -->         # disable always-apply
#
# Usage:
#   ./sync-claude-to-cursor-rules.sh          # one-shot sync
#   ./sync-claude-to-cursor-rules.sh --watch  # re-sync on change (needs inotifywait or fswatch)
#   ./sync-claude-to-cursor-rules.sh --check  # exit 1 if out of sync (for CI / pre-commit)
#   ./sync-claude-to-cursor-rules.sh --clean  # remove generated .mdc files

set -euo pipefail

SRC_DIR=".claude/rules"
DST_DIR=".cursor/rules"
GEN_MARKER="# DO NOT EDIT — generated from $SRC_DIR by sync-claude-to-cursor-rules.sh"

die() { echo "error: $*" >&2; exit 1; }
info() { echo "  $*"; }

require_src() {
    [[ -d "$SRC_DIR" ]] || die "$SRC_DIR not found — run from project root"
}

# Parse frontmatter directive from first line of source file.
# Echoes a YAML frontmatter block to stdout.
build_frontmatter() {
    local src_file="$1"
    local first_line
    first_line=$(head -n 1 "$src_file")

    # Default: always-apply
    local always_apply="true"
    local globs=""
    local description=""

    if [[ "$first_line" =~ ^\<!--[[:space:]]*cursor:[[:space:]]*(.*)[[:space:]]*--\>$ ]]; then
        local directive="${BASH_REMATCH[1]}"
        # Trim trailing whitespace (the regex's trailing [[:space:]]* is greedy-defeated by (.*))
        directive="${directive%"${directive##*[![:space:]]}"}"
        case "$directive" in
            manual)
                always_apply="false"
                ;;
            globs=*)
                always_apply="false"
                globs="${directive#globs=}"
                ;;
            description=*)
                always_apply="false"
                description="${directive#description=}"
                ;;
            alwaysApply=false)
                always_apply="false"
                ;;
            alwaysApply=true)
                always_apply="true"
                ;;
            *)
                echo "warning: unrecognized cursor directive in $src_file: $directive" >&2
                ;;
        esac
    fi

    echo "---"
    [[ -n "$description" ]] && echo "description: $description"
    [[ -n "$globs" ]] && echo "globs: $globs"
    echo "alwaysApply: $always_apply"
    echo "---"
}

# Build a single .mdc from a single .md
build_one() {
    local src_file="$1"
    local rel_name
    rel_name=$(basename "$src_file" .md)
    local dst_file="$DST_DIR/${rel_name}.mdc"

    {
        build_frontmatter "$src_file"
        echo ""
        echo "$GEN_MARKER"
        echo ""
        # Strip the magic-comment first line if present, otherwise pass through
        local first_line
        first_line=$(head -n 1 "$src_file")
        if [[ "$first_line" =~ ^\<!--[[:space:]]*cursor: ]]; then
            tail -n +2 "$src_file"
        else
            cat "$src_file"
        fi
    } > "$dst_file"

    info "synced $rel_name.md → $rel_name.mdc"
}

do_sync() {
    require_src
    mkdir -p "$DST_DIR"
    local count=0
    shopt -s nullglob
    for src in "$SRC_DIR"/*.md; do
        build_one "$src"
        count=$((count + 1))
    done
    shopt -u nullglob

    # Prune stale .mdc files that no longer have a source
    for dst in "$DST_DIR"/*.mdc; do
        [[ -f "$dst" ]] || continue
        local base
        base=$(basename "$dst" .mdc)
        if [[ ! -f "$SRC_DIR/${base}.md" ]]; then
            # Only prune files that carry our marker, to avoid clobbering hand-written rules
            if grep -qF "$GEN_MARKER" "$dst"; then
                rm "$dst"
                info "pruned stale $base.mdc"
            fi
        fi
    done

    echo "synced $count rule(s) to $DST_DIR/"
}

do_check() {
    require_src
    local tmp=""
    tmp=$(mktemp -d)
    # shellcheck disable=SC2064
    trap "rm -rf '$tmp'" EXIT

    # Build expected output into temp dir
    local DST_DIR_BACKUP="$DST_DIR"
    DST_DIR="$tmp"
    shopt -s nullglob
    for src in "$SRC_DIR"/*.md; do
        build_one "$src" >/dev/null
    done
    shopt -u nullglob
    DST_DIR="$DST_DIR_BACKUP"

    # Compare only files that exist in tmp (the generated set).
    # Hand-written .mdc files in $DST_DIR without our marker are out of scope.
    local out_of_sync=0
    shopt -s nullglob
    for expected in "$tmp"/*.mdc; do
        local base actual
        base=$(basename "$expected")
        actual="$DST_DIR/$base"
        if [[ ! -f "$actual" ]]; then
            echo "missing: $actual" >&2
            out_of_sync=1
        elif ! diff -q "$expected" "$actual" >/dev/null 2>&1; then
            echo "differs: $actual" >&2
            diff -u "$actual" "$expected" >&2 || true
            out_of_sync=1
        fi
    done
    # Also flag stale generated files (carry marker, source gone)
    for dst in "$DST_DIR"/*.mdc; do
        [[ -f "$dst" ]] || continue
        local base
        base=$(basename "$dst" .mdc)
        if [[ ! -f "$SRC_DIR/${base}.md" ]] && grep -qF "$GEN_MARKER" "$dst"; then
            echo "stale (source deleted): $dst" >&2
            out_of_sync=1
        fi
    done
    shopt -u nullglob

    if (( out_of_sync )); then
        echo "out of sync — run sync-claude-to-cursor-rules.sh to regenerate" >&2
        exit 1
    fi
    echo "in sync"
}

do_clean() {
    shopt -s nullglob
    for dst in "$DST_DIR"/*.mdc; do
        if grep -qF "$GEN_MARKER" "$dst"; then
            rm "$dst"
            info "removed $dst"
        fi
    done
    shopt -u nullglob
}

do_watch() {
    require_src
    do_sync
    echo "watching $SRC_DIR/ for changes..."
    if command -v inotifywait >/dev/null 2>&1; then
        while inotifywait -qq -e modify,create,delete,move "$SRC_DIR"; do
            do_sync
        done
    elif command -v fswatch >/dev/null 2>&1; then
        fswatch -o "$SRC_DIR" | while read -r _; do
            do_sync
        done
    else
        die "watch mode needs inotifywait (Linux: apt install inotify-tools) or fswatch (macOS: brew install fswatch)"
    fi
}

case "${1:-sync}" in
    sync|"")  do_sync ;;
    --watch|watch) do_watch ;;
    --check|check) do_check ;;
    --clean|clean) do_clean ;;
    -h|--help|help)
        sed -n '2,/^$/p' "$0" | sed 's/^# \?//'
        ;;
    *)
        die "unknown command: $1 (try --help)"
        ;;
esac