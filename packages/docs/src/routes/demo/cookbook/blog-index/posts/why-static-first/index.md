---
title: 'Why static-first'
published: '2026-09-14'
description: 'Starting from static output and adding interactivity only where it is needed.'
---

# Why static-first

A page that starts static is fast by default: the browser renders HTML it already has, and
nothing blocks on JavaScript. Interactivity is then added in small pieces, exactly where the
page needs it, instead of upfront for the whole page.

This post is plain Markdown — no components, no imports. The blog index lists it next to the
MDX posts, because the glob covers both `.mdx` and `.md` files.
