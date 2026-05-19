cat > .cursor/rules/claude-rules-pointer.mdc <<'EOF'
---
alwaysApply: true
---

# Project rules source of truth

The canonical project rules and current workflow state live in `.claude/rules/`.

At the start of every session:
1. Read `.claude/rules/STATE.md` to understand current workflow state.
2. Read any other files in `.claude/rules/` relevant to the task at hand.

Before ending any session that made meaningful progress, update `.claude/rules/STATE.md` to reflect:
- What was completed
- What is in progress
- Open questions and next steps
- Any decisions made that future sessions need to know

`.claude/rules/STATE.md` is the source of truth — prefer it over assumptions.
EOF