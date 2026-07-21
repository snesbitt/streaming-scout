# Streaming Log

**Last updated:** 2026-07-21 (reset)

## 2026-07-21 — data loss notice

The prior watch-history log was written to a Cowork session's own ephemeral output
folder rather than a stable location, and that session is no longer reachable — the
log (multiple years of Netflix/Prime viewing history) could not be recovered.

This file is intentionally empty going forward. The next run of the `sync-watch-history`
skill will repopulate it from Netflix's and Prime Video's own "Viewing activity" /
"Watch history" pages, most-recent-first, per that skill's normal format below. Netflix in
particular exposes a long scrollable history, so a full re-sync should recover a
substantial amount of real signal — it just won't be a byte-identical copy of the old log.

## Entry format (unchanged)

```markdown
## [Date]
**Title:** [name]
**Service:** [Netflix / Prime]
**Status:** [finished / in progress / abandoned]
**Cast:** [lead actors, if known]
```
