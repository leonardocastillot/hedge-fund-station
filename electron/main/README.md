# Electron Main Process Layout

The Electron main process is split by responsibility:

- `app/` owns menus, updates, window-facing app lifecycle helpers, and
  distribution-adjacent behavior.
- `ipc/` owns channel registration and the preload-facing IPC boundary.
- `native/` owns OS integrations such as terminals, workspaces, diagnostics,
  Obsidian, voice transcription, AI provider config, and agent loop helpers.

Keep trading computation, replay, backtests, and paper execution out of
Electron. The desktop shell may launch or inspect backend services, but the
backend remains the source of truth for market decisions.
