---
title: Plain Markdown Works Too
date: '2024-05-20'
description: The glob pattern picks up .md files alongside .mdx.
---

# Plain Markdown Works Too

This file is `.md` rather than `.mdx`, but the same `import.meta.glob` pattern covers both.

Frontmatter parsing is identical — Qwik Router exposes the parsed YAML as a `frontmatter` named export on the module.
