# ⚡ Leonardo's Command Center

**A unified workspace management system for trading, development, services, and marketing.**

Built with Electron, React, TypeScript, and integrated native terminals.

---

## ✨ Overview

**Command Center** is a multi-context desktop application that serves as the central hub for all work activities:

- 💹 **Hedge Fund**: Trading strategies, backtesting, market analysis, economic calendar
- 💻 **Development**: Project development, code editing, testing, debugging
- 🏢 **Services**: Client project management, deliverables, time tracking
- 📱 **Marketing**: Content calendar, landing pages, social media management

Each context provides a tailored interface with relevant tools, workspaces, and workflows.

---

## 🎯 Key Features

### 🖥️ Native Desktop Experience
- **Integrated Terminals**: PowerShell/CMD/Bash terminals with WebGL-accelerated rendering (xterm.js)
- **Workspace Management**: Quick switching between project directories
- **Resizable Layout**: 3-panel interface (Sidebar | Context Panel | Terminal Grid)
- **Native Performance**: Zero-latency terminal I/O using node-pty

### 🎨 Context Switching System
- **4 Contexts**: Switch between Hedge Fund, Development, Services, and Marketing
- **Dynamic Panels**: Center panel changes based on active context
- **Visual Indicators**: Color-coded tabs with active state highlighting
- **State Persistence**: Last active context saved to localStorage

### 📊 Hedge Fund Context
- **Dashboard**: Live BTC price, market indicators, buy signals
- **Strategies**: Browse and analyze trading strategies
- **Backtesting**: Run strategy simulations with detailed analytics
- **Insights**: Market analysis and technical indicators
- **Calendar**: Forex Factory economic calendar with impact levels

### 💻 Development Context
- **Quick Actions**: npm run dev, build, test, lint buttons
- **Project Status**: Path, stack, and status information
- **Development Workspace**: Direct terminal access to project directory
- **Self-managing**: Work on the app from within the app

### 📟 Terminal Grid
- **Maximum 6 Terminals**: Organized in auto-layout grid (1x1, 2x1, 2x2, 2x3)
- **Space Optimized**: Ultra-compact headers (~50% less padding)
- **Legible Font**: 11px with 0.3 letter-spacing for clarity
- **Glassmorphism**: Transparent backgrounds with blur effects
- **Smart Layout**: Automatically arranges terminals based on count

---

## 🏗️ Architecture

### Tech Stack
- **Framework**: Electron 28 with electron-vite
- **Frontend**: React 18, TypeScript, Tailwind CSS
- **Terminal**: xterm.js (WebGL), node-pty
- **Layout**: react-resizable-panels
- **Charts**: Chart.js, Recharts, Lightweight Charts
- **State**: React Context API
- **Backends**:
  - Hyperliquid FastAPI gateway in Docker on `http://127.0.0.1:18001`
  - Legacy trading API in Docker on `http://127.0.0.1:18000`

### Hedge Fund Operating Model

For hedge fund work, this repo should be split by responsibility:

- Electron app: visualization, review, control surfaces, anomaly inspection
- backend services: strategy logic, signal generation, persistence, replay, paper execution
- Docker / external processes: heavy and long-running workloads

If an agent creates or improves a strategy, the default target should be:

- strategy spec in `docs/strategies/`
- backend implementation in `backend/hyperliquid_gateway/strategies/`
- UI only after the backend contract exists

Reference:

- `docs/hedge-fund-agent-operating-model.md`
- `AGENTS.md`
- `skills/`

### Project Structure
```
hedge-fund-station/
├── electron/              # Main Process (Node.js)
│   ├── main/              # PTY manager, workspace manager, IPC
│   ├── preload/           # Security bridge
│   └── types/             # TypeScript definitions
│
├── src/                   # Renderer Process (React)
│   ├── components/
│   │   ├── electron/      # Terminal, Sidebar, Layout
│   │   ├── panels/        # DevPanel, ServicesPanel, MarketingPanel
│   │   ├── widgets/       # WidgetPanel (Hedge Fund router)
│   │   ├── trading/       # Charts, live price
│   │   └── ui/            # Primitives
│   ├── contexts/          # ContextContext, TerminalContext, WorkspaceContext
│   ├── pages/             # Dashboard, Backtest, Insights, Calendar, etc.
│   ├── services/          # API client (api.ts)
│   └── hooks/             # Custom hooks
│
├── .env                   # VITE_API_URL=http://127.0.0.1:18001
├── package.json           # Dependencies and scripts
└── README.md              # This file
```

### Key Components

**Context System**:
- `ContextContext.tsx`: Manages active context and provides context switching
- `ContextSwitcher.tsx`: Tab bar at top for switching between contexts
- Context-specific panels: `DevPanel`, `ServicesPanel`, `MarketingPanel`, `WidgetPanel`

**Terminal System**:
- `TerminalContext.tsx`: Manages terminal sessions with callback pattern
- `TerminalGrid.tsx`: CSS Grid layout for up to 6 terminals
- `TerminalPane.tsx`: Individual terminal component with xterm.js

**Workspace System**:
- `WorkspaceContext.tsx`: Manages workspace configuration
- `Sidebar.tsx`: Workspace list and switching interface
- Config: `C:\Users\leonard\.hedge-station\workspaces.json`

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Python 3.9+ (for Hedge Fund backend)
- Windows 10/11 (current build)

### Installation

```bash
# Navigate to project
cd C:\Users\leonard\Documents\hedge-fund-station

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will open automatically with Electron.

### Backend Setup (for Hedge Fund features)

```bash
# In this repo
docker compose up -d hyperliquid-backend
```

Backends run on:

- `http://127.0.0.1:18001` for Hyperliquid market and paper-trading services
- `http://127.0.0.1:18000` for calendar, legacy strategy cache, backtests and portfolio services

The implementation owned by this repo is still `backend/hyperliquid_gateway/`, but the current desktop runtime is dual-backend until those legacy capabilities are migrated.

---

## 📖 Usage Guide

### 🎯 Context Switching

**Top Tab Bar** shows 4 contexts:
- 💹 **Hedge Fund**: Trading, strategies, backtesting
- 💻 **Development**: Work on the app itself
- 🏢 **Services**: Client projects (coming soon)
- 📱 **Marketing**: Content and social media (coming soon)

Click any tab to switch contexts. The center panel updates dynamically.

### 📁 Workspaces

**Left Sidebar** shows available workspaces:
- **Hedge Fund Trading**: `C:\Users\leonard\Documents\trading`
- **m-risk**: `C:\Users\leonard\Documents\powerbi`
- **🚀 Development**: `C:\Users\leonard\Documents\hedge-fund-station`

Click a workspace to:
- Open a new terminal in that directory
- Set it as the active workspace
- The terminal appears in the right panel grid

### 💹 Hedge Fund Context

Navigate through pages using the internal tab bar:

**Dashboard**:
- Live BTC price with 24h change
- Market indicators (RSI, MACD, Bollinger Bands)
- Buy signals with scoring system
- Performance stats

**Strategies**:
- Strategy library with risk/reward profiles
- Performance metrics
- Strategy details and parameters

**Backtest**:
- Select strategy, timeframe, and period
- Run backtesting simulations
- View detailed results with equity curves
- Compare multiple strategies

**Insights**:
- Market analysis across timeframes
- Technical indicators
- Trend detection
- Signal strength analysis

**Calendar**:
- Forex Factory economic calendar
- High/medium/low impact events
- Countdown to next event
- Actual vs forecast values

### 💻 Development Context

**Quick Actions**:
- 🚀 npm run dev
- 📦 npm run build
- 🧪 npm test
- 🔍 npm run lint

**Tip**: Use the "🚀 Development" workspace in the sidebar to open a terminal in the project directory, then execute commands manually.

### 📟 Terminal Grid

**Right Panel** (Terminal Grid):
- Displays up to 6 terminals in organized grid
- **Auto-layout**:
  - 1 terminal: 1x1
  - 2 terminals: 2x1 (horizontal)
  - 3-4 terminals: 2x2 (grid)
  - 5-6 terminals: 2x3 (3 columns)
- Click **workspace** in sidebar to create new terminal
- Close terminal with **×** button in header
- Terminals maintain their working directory

**Keyboard Shortcuts**:
- `Ctrl+T`: New terminal (planned)
- `Ctrl+W`: Close active terminal (planned)
- `Ctrl+1-9`: Switch workspace (planned)

### 🎨 Resize Panels

Drag the **purple handles** between panels to adjust sizes:
- Sidebar: 15-30% width
- Center Panel: 30%+ width
- Terminal Grid: 20%+ width

---

## ⚙️ Configuration

### Workspace Configuration

**Location**: `C:\Users\leonard\.hedge-station\workspaces.json`

```json
{
  "workspaces": [
    {
      "id": "hedge-fund-trading",
      "name": "Hedge Fund Trading",
      "path": "C:\\Users\\leonard\\Documents\\trading",
      "icon": "briefcase",
      "color": "#8b5cf6",
      "default_commands": [],
      "shell": "powershell.exe"
    },
    {
      "id": "development-workspace",
      "name": "🚀 Development",
      "path": "C:\\Users\\leonard\\Documents\\hedge-fund-station",
      "icon": "rocket",
      "color": "#10b981",
      "shell": "powershell.exe",
      "default_commands": []
    }
  ],
  "active_workspace_id": "hedge-fund-trading"
}
```

**Fields**:
- `id`: Unique workspace identifier
- `name`: Display name in sidebar
- `path`: Workspace directory (terminals open here)
- `icon`: Icon identifier (briefcase, rocket, folder, code)
- `color`: Hex color for active indicator
- `default_commands`: Commands to execute on switch (optional)
- `shell`: Shell executable (powershell.exe, cmd.exe, bash)

### Environment Variables

**Location**: `.env`

```env
VITE_API_URL=http://127.0.0.1:18001
VITE_WS_URL=ws://127.0.0.1:18001
VITE_LEGACY_API_URL=http://127.0.0.1:18000
```

Change these to point to a different backend server if needed.

### Context Persistence

Active context is automatically saved to `localStorage` and restored on app restart.

---

## 🧪 Development

### Running Development Server

```bash
npm run dev
```

This starts:
- Electron app with hot reload
- Vite dev server (port 5173-5176)
- TypeScript compilation
- Main process watching

### Key Commands

```bash
npm run dev          # Start development
npm run build        # Build for production
npm run preview      # Preview production build
npm run dist:win     # Create Windows installer
npm run hf:doctor    # Audit repo + donor assets + CLI prerequisites
npm run hf:backtest  # Run backend-first backtest and write JSON report
npm run hf:validate  # Validate strategy doc/module/report completeness
npm run hf:paper     # Create paper candidate artifact from latest report
npm run hf:status    # Show latest research/backtest/paper artifact status
```

### File Watching

- **Main Process**: Auto-restarts on changes to `electron/`
- **Renderer**: Hot Module Replacement (HMR) for `src/`
- **Preload**: Requires manual reload (Ctrl+R in app)

### Debugging

- **Renderer**: DevTools (Ctrl+Shift+I or F12)
- **Main Process**: Console logs in terminal running `npm run dev`
- **Backend**: FastAPI logs in backend terminal
- **Terminal I/O**: PTY logs appear in main process console

---

## 📊 API Endpoints

### Hedge Fund Backends

**Hyperliquid gateway** (`http://127.0.0.1:18001`):
- `GET /health`
- `GET /api/hyperliquid/overview`
- `GET /api/hyperliquid/paper/trades`
- `GET /api/liquidations/*`
- `GET /api/polymarket/*`

**Legacy trading API** (`http://127.0.0.1:18000`):
- `GET /health`
- `GET /api/calendar/this-week`
- `POST /api/calendar/fetch`
- `GET /api/portfolio/strategies/library`
- `GET /api/portfolio/overview`
- `GET /api/backtest/trades/{strategy_name}`

---

## 🎨 Design System

### Context Colors

- 💹 Hedge Fund: `#8b5cf6` (purple)
- 💻 Development: `#10b981` (green)
- 🏢 Services: `#3b82f6` (blue)
- 📱 Marketing: `#f59e0b` (amber)

### Terminal Styling

- **Font**: 11px monospace with 0.3 letter-spacing
- **Line Height**: 1.1
- **Background**: Glassmorphism (rgba(26, 31, 46, 0.7) with blur)
- **Border**: 1px solid rgba(167, 139, 250, 0.2)
- **Header**: Ultra-compact 4px padding
- **Cursor**: Block style with purple accent

### Theme

- **Background**: Dark gradient (`#060913` → `#0a0e1a` → `#0d1221`)
- **Primary**: Purple (`#8b5cf6`)
- **Accent**: Light purple (`#a78bfa`)
- **Text**: Light gray (`#e0e0e0`)
- **Secondary**: Medium gray (`#9ca3af`)

---

## 📝 Development Status

### ✅ Phase 1-2: Command Center Core (COMPLETE)
- [x] Context switching system
- [x] 4-context architecture
- [x] Dynamic panel rendering
- [x] State persistence
- [x] ContextSwitcher UI
- [x] DevPanel implementation
- [x] ServicesPanel placeholder
- [x] MarketingPanel placeholder

### ✅ Phase 3: Terminal Optimization (COMPLETE)
- [x] CSS Grid layout system
- [x] 6-terminal maximum
- [x] Auto-layout (1x1, 2x1, 2x2, 2x3)
- [x] Space optimization (~50% less padding)
- [x] Font optimization (11px)
- [x] Glassmorphism styling
- [x] WebGL rendering

### ✅ Phase 4: Workspace Integration (COMPLETE)
- [x] Workspace switching with callback pattern
- [x] Terminal creation on workspace switch
- [x] Development workspace configuration
- [x] Component visibility fixes (height cascade)
- [x] All hedge fund pages visible and scrollable

### 🚧 Phase 5: Enhancement (IN PROGRESS)
- [x] All core features working
- [ ] Keyboard shortcuts (Ctrl+1-4, Ctrl+T, Ctrl+W)
- [ ] File explorer in DevPanel
- [ ] Git integration in DevPanel
- [ ] ServicesPanel implementation
- [ ] MarketingPanel implementation

### ⏳ Phase 6: Production (PLANNED)
- [ ] App icon (1024x1024)
- [ ] Windows installer (NSIS)
- [ ] Code signing
- [ ] Auto-updater
- [ ] Error boundaries
- [ ] Settings persistence

**Current Progress**: ~85% complete

---

## 🐛 Known Issues

### Non-Critical
- GPU cache warnings on startup (Windows permission issue, cosmetic only)
- Backend DNS errors for Coinglass API (external service, doesn't affect app)
- Hot reload occasionally causes terminal creation errors (restart fixes)

### Backend Dependencies
- Hedge Fund features require FastAPI backend on localhost:8000
- Economic calendar requires external Forex Factory scraping
- Liquidations require Coinglass API (optional)

### Performance
- Maximum 6 terminals enforced to prevent grid overflow
- WebGL rendering enabled for optimal terminal performance
- Terminal font size optimized for legibility

---

## 🔧 Troubleshooting

### App Won't Start
```bash
# Clear cache and reinstall
rm -rf node_modules dist-electron
npm install
npm run dev
```

### Backend Connection Failed
- Verify backend is running: `http://localhost:8000/docs`
- Check `.env` file has correct `VITE_API_URL`
- Ensure no firewall blocking port 8000

### Terminal Not Opening
- Check workspace path exists in filesystem
- Verify shell executable exists (powershell.exe)
- Check terminal context logs in DevTools console

### Context Switching Not Working
- Clear localStorage: DevTools → Application → Local Storage → Clear
- Restart app
- Check browser console for React errors

---

## 🚀 Roadmap

### Short Term (Phase 5)
- File explorer with directory tree in DevPanel
- Git status and branch info in DevPanel
- ProjectsPanel for Services context (client list, tasks)
- ContentPanel for Marketing context (calendar, queue)
- Keyboard shortcuts implementation

### Medium Term (Phase 6)
- Workspace templates
- Terminal themes and customization
- Command history sync
- Settings page (theme, font, shell preference)
- Performance monitoring dashboard

### Long Term
- Remote workspace support (SSH)
- Multi-user collaboration
- Plugin system for custom contexts
- AI assistant per context
- Mobile companion app
- Cloud sync

---

## 📄 License

Private project - All rights reserved

---

## 👤 Author

**Leonardo**

Built with Claude Code (Anthropic)

---

## 🙏 Acknowledgments

- **Electron** - Desktop app framework
- **xterm.js** - Terminal emulator with WebGL
- **node-pty** - Native pseudoterminal bindings
- **React** - UI library
- **Tailwind CSS** - Utility-first styling
- **FastAPI** - Python backend framework
- **Anthropic Claude** - AI pair programming

---

**Current Version**: 1.0.0 (Command Center Launch)
**Last Updated**: March 4, 2026
**Status**: 🚀 Operational - Command Center Online
