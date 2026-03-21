# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Hedge Fund Station** is a native Electron desktop application for unified workspace management, trading operations, and development work. It provides:

- 💹 **Multi-context system**: Hedge Fund, Development, Services, Marketing
- 💻 **Integrated terminals**: xterm.js-based terminals with node-pty backend
- 🏢 **Workspace management**: Project-based directory switching with persistent configuration
- 📊 **Trading dashboard**: Real-time market data, backtesting, indicators, and signals
- 🔄 **Auto-updating**: Built-in update manager with GitHub releases integration

The app automatically launches a Python backend server for trading data and analysis.

## Development Commands

```bash
# Development
npm run dev              # Start app in dev mode (opens DevTools, hot-reload enabled)

# Building
npm run build            # Build renderer, main, and preload
npm run build:clean      # Clean all build artifacts and rebuild

# Distribution
npm run dist             # Build and package for current platform
npm run dist:win         # Build Windows NSIS installer + portable
npm run dist:portable    # Build Windows portable only
npm run dist:dir         # Build unpacked directory (for testing)

# Preview
npm run preview          # Preview production build without packaging
```

## Architecture

### Three-Layer Context System

The app uses a nested provider architecture (see `src/App.tsx`):

1. **ContextProvider** (`src/contexts/ContextContext.tsx`)
   - Manages 4 work contexts: Hedge, Development, Services, Marketing
   - Each context has distinct color scheme and icon
   - Active context persisted to localStorage
   - Switched via `ContextSwitcher` tab bar

2. **WorkspaceProvider** (`src/contexts/WorkspaceContext.tsx`)
   - Manages workspaces stored in `C:\Users\leonard\.hedge-station\workspaces.json`
   - Each workspace = { id, name, path, shell, icon }
   - Provides: `setActiveWorkspace()`, `createWorkspace()`, `updateWorkspace()`, `deleteWorkspace()`
   - IPC bridge to electron main process for workspace CRUD

3. **TerminalProvider** (`src/contexts/TerminalContext.tsx`)
   - State management for terminal sessions
   - **Maximum 6 terminals enforced** (see `MAX_TERMINALS` in `TerminalGrid.tsx`)
   - Callback pattern: `onLayoutUpdateNeeded()` for external terminal creation
   - Terminal sessions: `{ id, label, cwd, shell, createdAt }`

### Layout System

**3-Panel Resizable Layout** (`src/components/electron/ElectronLayout.tsx`):
- Left: Workspace sidebar (20% default, 15-30% range)
- Center: Context-dependent panel (45% default, 30%+ minimum)
  - Hedge → `WidgetPanel` (trading dashboard)
  - Dev → `DevPanel` (development tools)
  - Services → `ServicesPanel` (client projects)
  - Marketing → `MarketingPanel` (content/campaigns)
- Right: Terminal grid (40% default, 20%+ minimum)

Uses `react-resizable-panels` with custom styled resize handles.

### Terminal System

**TerminalGrid** (`src/components/electron/TerminalGrid.tsx`):
- CSS Grid layout with dynamic cols/rows based on terminal count
- Layouts: 1x1 (1 term) → 2x1 (2 terms) → 2x2 (3-4 terms) → 2x3 (5-6 terms)
- Vertical mode available (stacked layout)
- Glassmorphism UI with red accent color scheme

**TerminalPane** (`src/components/electron/TerminalPane.tsx`):
- xterm.js v6 with WebGL renderer addon
- 11px font size, custom theme matching app design
- node-pty backend via Electron IPC
- Resizable with fit addon

**PTYManager** (`electron/main/pty-manager.ts`):
- Manages node-pty instances on main process
- Handles terminal creation, resize, write, kill
- Sends output to renderer via IPC events

### Backend Integration

**Auto-start Python Backend** (`electron/main/index.ts:21-46`):
- Launches `python main.py` in `C:\Users\leonard\Documents\trading\backend`
- Started 1 second after window creation
- Killed on app close
- Logs to console: stdout and stderr

**API Service** (`src/services/api.ts`):
- Base URL: `http://localhost:8000` (configurable via `VITE_API_URL`)
- WebSocket: `ws://localhost:8000/ws` (configurable via `VITE_WS_URL`)
- Axios instance with 120s timeout for long-running backtests
- Error interceptor logs API failures
- Key endpoints:
  - `/api/price/*` - Live price data
  - `/api/indicators/*` - Technical indicators (RSI, MACD, BB, etc.)
  - `/api/signals/buy` - Buy signals with scores
  - `/api/backtest/*` - Strategy backtesting (standard + detailed)
  - `/api/liquidations/*` - Liquidation insights
  - `/ws` - WebSocket for real-time updates

**BackendStatus Component** (`src/components/electron/BackendStatus.tsx`):
- Health check every 10 seconds (`/health` endpoint)
- Visual indicator in header (green=connected, orange=checking, red=offline)
- Click to manually retry connection

## Key Patterns & Conventions

### Electron IPC Architecture

**Preload Bridge** (`electron/preload/index.ts`):
- Exposes safe APIs to renderer via `contextBridge`
- `window.electronAPI.terminal.*` - Terminal operations
- `window.electronAPI.workspace.*` - Workspace CRUD
- `window.electronAPI.updates.*` - Update manager

**IPC Handlers** (`electron/main/ipc-handlers.ts`):
- Registered in `electron/main/index.ts`
- Terminal handlers use `PTYManager` instance
- Workspace handlers use `WorkspaceManager` instance

### Component Structure

- **contexts/** - React Context providers (state management)
- **components/electron/** - Desktop-specific UI (sidebar, terminals, layout)
- **components/panels/** - Context-specific center panels
- **components/widgets/** - Trading widgets (charts, indicators)
- **components/ui/** - Reusable UI primitives (GlassPanel, Button, Badge)
- **pages/** - Full-page views (dashboard, backtest, liquidations, settings)
- **services/** - API clients and business logic

### Styling Approach

- Inline styles with glassmorphism effects
- Color palette: Red accent (#ef4444, #dc2626, #b91c1c, #991b1b)
- Dark gradient backgrounds with radial glow effects
- Backdrop blur with saturation: `backdrop-filter: blur(20px) saturate(180%)`
- No CSS files - all styling in TSX for component-scoped design

### TypeScript Aliases

- `@/*` resolves to `src/*` (configured in `tsconfig.json` and `electron.vite.config.ts`)
- Import example: `import { useTerminalContext } from '@/contexts/TerminalContext'`

## Critical Rules

### 1. NO Mock Data
**All components MUST use real backend endpoints.** Never add placeholder data or mock responses. If backend endpoint doesn't exist, request backend changes or defer feature until API is ready.

### 2. Workspace Behavior
**Workspaces only change directory.** Never auto-execute commands when switching workspaces. Terminals should open in workspace path but wait for user input. User explicitly stated: "Workspaces solo cambian directorio - NO auto-ejecutar comandos sin permiso."

### 3. Terminal Limits
**Strict 6-terminal maximum.** Enforced in `TerminalGrid.tsx` with user-facing alerts. Do not increase this limit - it's intentional for performance and usability. Over 6 terminals causes grid overflow and degrades user experience.

### 4. Production-Ready Code
**No placeholders or temporary code.** All code must be production-quality:
- No `TODO` comments without tracking
- No commented-out code blocks
- No console.logs in production builds (use proper logging)
- No "Coming soon" or stub implementations

### 5. File Organization
**Keep electron main/preload/renderer separation clear:**
- `electron/main/*` - Node.js APIs, IPC handlers, managers
- `electron/preload/*` - Secure IPC bridge only
- `src/*` - Renderer process (React), no Node.js APIs

## Testing & Debugging

- **DevTools**: Automatically open in dev mode (`npm run dev`)
- **Logs**: Check terminal output for backend logs (prefixed with `[Backend]`)
- **IPC debugging**: Enable `webContents.openDevTools()` in production for troubleshooting
- **Backend health**: Click backend status indicator in header to retry connection
- **Terminal issues**: Check `PTYManager` logs in main process console

## Distribution Notes

- **Installer**: NSIS installer with custom settings (non-one-click, elevation allowed)
- **Portable**: Standalone executable (no installation required)
- **Updates**: GitHub releases integration via `electron-updater`
- **Config location**: User data stored in `C:\Users\<username>\.hedge-station\`
- **Workspace config**: `C:\Users\leonard\.hedge-station\workspaces.json`

## Backend Dependency

The app depends on a Python backend server running at `http://localhost:8000`. The backend:
- Auto-starts on app launch (after 1s delay)
- Provides trading data, indicators, signals, and backtesting
- Uses FastAPI with WebSocket support
- Located at: `C:\Users\leonard\Documents\trading\backend`

Ensure backend is functional before adding new trading features. Backend endpoints follow REST conventions with consistent response format:
```json
{
  "data": { ... },
  "timestamp": "2026-03-04T..."
}
```
