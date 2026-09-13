# C$K4 Chat changelog

## 5.2.0 — 2026-09-10

- Persisted message reactions in SQLite; reacting again toggles the current user's reaction.
- Added reaction history to direct-chat and personal JSON backups.
- Hardened admin authorization by checking the current database role instead of trusting an old JWT claim.
- Fixed admin panel sender/recipient, report, audit, online-count, search and deletion issues.
- Added safe cleanup for deleted users, stories, groups and related records.
- Restricted Socket.IO group/channel room joins to real members/subscribers.
- Fixed block enforcement in both directions, upload MIME validation, location validation and message length checks.
- Removed third-party runtime scripts and wildcard CORS.
- Updated Multer/UUID, added a Node version requirement and introduced `npm run check`.