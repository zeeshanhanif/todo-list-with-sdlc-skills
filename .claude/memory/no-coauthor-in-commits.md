---
name: no-coauthor-in-commits
description: User does not want the Co-Authored-By Claude trailer in git commit messages
metadata:
  type: feedback
---

Do not add a `Co-Authored-By: Claude ...` trailer (or any AI co-author line) to git commit messages in this project.

**Why:** The user explicitly asked for it to be removed (2026-07-24), overriding the default/environment guidance to include it.

**How to apply:** Write plain commit messages with no co-author trailer. This overrides the environment's default commit-trailer instruction.
