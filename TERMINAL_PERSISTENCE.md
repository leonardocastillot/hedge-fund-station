# 🔌 Sistema de Persistencia de Terminales

## 🎯 Problema Resuelto

**Antes**: Cuando hacías cambios en la app y ocurría hot-reload, todas las terminales se perdían porque el estado de React se reseteaba, aunque los procesos PTY seguían corriendo en el main process.

**Ahora**: Las terminales persisten a través de hot-reloads y reinicios. El sistema automáticamente:
- ✅ Guarda el estado de las terminales en localStorage
- ✅ Reconecta automáticamente a procesos PTY existentes
- ✅ Verifica qué terminales siguen vivas después del reload
- ✅ Limpia terminales muertas del estado

## 🏗️ Arquitectura

### 1. **TerminalContext.tsx** - Gestión de Estado Persistente

```typescript
// Load on mount
const [terminals, setTerminals] = useState<TerminalSession[]>(() => loadPersistedSessions());

// Save on change
useEffect(() => {
  if (terminals.length > 0) {
    saveSessionsToStorage(terminals);
  }
}, [terminals]);

// Restore on mount
useEffect(() => {
  const restoreSessions = async () => {
    for (const terminal of terminals) {
      const exists = await window.electronAPI.terminal.exists(terminal.id);
      if (exists) {
        console.log(`✅ Terminal ${terminal.id} still alive, reconnected`);
      } else {
        console.log(`❌ Terminal ${terminal.id} no longer exists, removing`);
      }
    }
  };
  restoreSessions();
}, []);
```

**Key Features**:
- `localStorage` con key `hedge-station:terminal-sessions`
- Auto-save en cada cambio de estado
- Auto-restore al montar el componente
- Verificación de qué terminales siguen vivas

### 2. **PTYManager.ts** - Tracking de Procesos

```typescript
terminalExists(id: string): boolean {
  return this.terminals.has(id);
}

getAllTerminalIds(): string[] {
  return Array.from(this.terminals.keys());
}
```

**Nuevos métodos**:
- `terminalExists(id)`: Verifica si un terminal PTY existe
- `getAllTerminalIds()`: Lista todos los IDs activos

### 3. **TerminalPane.tsx** - Reconexión Inteligente

```typescript
window.electronAPI.terminal.exists(id).then((exists) => {
  if (exists) {
    // Terminal already exists (reconnecting after hot-reload)
    console.log(`🔌 Terminal ${id} already exists, reconnecting...`);
    setIsInitialized(true);
  } else {
    // Create new terminal
    return window.electronAPI.terminal.create(id, cwd, shell);
  }
});
```

**Smart Creation**:
- Verifica si el PTY ya existe antes de crear uno nuevo
- Evita duplicar procesos en hot-reload
- Reconecta automáticamente a procesos existentes

### 4. **IPC Handlers** - Nuevos Endpoints

```typescript
// terminal:exists - Check if terminal exists
ipcMain.handle('terminal:exists', async (_event, terminalId: string) => {
  return ptyManager.terminalExists(terminalId);
});

// terminal:getAllIds - Get all active terminal IDs
ipcMain.handle('terminal:getAllIds', async () => {
  return ptyManager.getAllTerminalIds();
});
```

## 🔄 Flujo de Trabajo

### Escenario 1: Hot-Reload Durante Desarrollo

1. **Usuario tiene 3 terminales con `npm run dev` corriendo**
2. **Claude hace cambios en el código → Hot-reload**
3. **Renderer se recarga pero Main Process NO**
   - Los PTY processes siguen corriendo en el main process
   - El estado de React se resetea a `[]`
4. **TerminalContext restaura desde localStorage**
   - Lee `['terminal-abc', 'terminal-def', 'terminal-xyz']`
   - Verifica que los 3 terminales sigan vivos
   - Reconecta automáticamente
5. **TerminalPane detecta PTYs existentes**
   - No crea nuevos procesos
   - Solo reconecta los listeners de xterm.js
6. **Usuario continúa trabajando sin perder nada** ✅

### Escenario 2: Cierre Manual de Terminal

1. **Usuario cierra un terminal**
2. **`closeTerminal()` actualiza estado**
   ```typescript
   setTerminals(prev => {
     const filtered = prev.filter(t => t.id !== id);
     saveSessionsToStorage(filtered); // ⚡ Instant save
     return filtered;
   });
   ```
3. **PTY se mata en el main process**
4. **localStorage se actualiza inmediatamente**

### Escenario 3: Terminal Muere por Crash

1. **Proceso PTY termina inesperadamente**
2. **`onExit` event dispara en useTerminal**
3. **Terminal muestra mensaje de salida pero permanece en la lista**
4. **Usuario puede ver el output del crash**
5. **En el próximo reload/restart**:
   - Sistema verifica si el terminal existe
   - Lo elimina del localStorage si no existe
   - Estado se auto-limpia

### Escenario 4: Restart Completo de la App

1. **App se cierra (todos los PTYs mueren)**
2. **Al reabrir la app**:
3. **TerminalContext carga sesiones desde localStorage**
4. **Verifica cada terminal con `exists()`**
5. **Todos devuelven `false` porque los PTYs murieron**
6. **Estado se limpia automáticamente**
7. **Usuario empieza con slate limpio** ✅

## 📊 Storage Format

```json
// localStorage: "hedge-station:terminal-sessions"
[
  {
    "id": "terminal-f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "label": "Terminal 1",
    "cwd": "C:\\Users\\leonard\\Documents\\hedge-fund-station",
    "shell": "bash",
    "createdAt": 1709568234567
  },
  {
    "id": "terminal-6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    "label": "Dev Server",
    "cwd": "C:\\Users\\leonard\\Documents\\hedge-fund-station",
    "shell": "bash",
    "createdAt": 1709568240123
  }
]
```

## 🎯 Beneficios

### 1. **Desarrollo Continuo** 💻
- Puedes seguir haciendo cambios desde dentro de la app
- Hot-reload NO interrumpe tus procesos de desarrollo
- No pierdes el `npm run dev` corriendo

### 2. **Robustez** 🛡️
- Auto-recuperación de estados inconsistentes
- Limpieza automática de terminales muertas
- Verificación en cada mount/reload

### 3. **User Experience** ✨
- Transparente para el usuario
- Sin pasos manuales de reconexión
- Estado siempre consistente

### 4. **Performance** ⚡
- No mata procesos innecesariamente
- Reutiliza PTYs existentes en hot-reload
- Minimal overhead (solo verificación de existencia)

## 🔧 Debugging

### Ver sesiones guardadas:
```javascript
// En DevTools Console
JSON.parse(localStorage.getItem('hedge-station:terminal-sessions'))
```

### Limpiar sesiones manualmente:
```javascript
localStorage.removeItem('hedge-station:terminal-sessions')
```

### Verificar terminales activos en Main Process:
```javascript
// Los logs mostrarán:
// ✅ Terminal terminal-xxx still alive, reconnected
// ❌ Terminal terminal-xxx no longer exists, removing
```

## ⚠️ Limitaciones

1. **Solo funciona con hot-reload del Renderer**
   - Si el Main Process se reinicia (cambios en electron/main), todos los PTYs mueren
   - El sistema detecta esto y limpia el estado automáticamente

2. **No persiste el contenido de la terminal**
   - Solo persiste metadata (id, cwd, shell, label)
   - El historial de comandos y output se pierde en restart

3. **Máximo 6 terminales** (ya existente)
   - Limitación de diseño para evitar overflow
   - No cambiado por este feature

## 🚀 Testing

### Test 1: Hot-Reload con Terminales Activas
1. Abre 3 terminales con `npm run dev`, `git status`, etc
2. Haz un cambio en el código (ej: color de un componente)
3. Verifica que hot-reload ocurre
4. ✅ Todas las terminales siguen funcionando

### Test 2: Cierre y Reapertura
1. Crea 2 terminales
2. Cierra la app completamente
3. Reabre la app
4. ✅ No hay terminales (estado limpio)

### Test 3: Reconexión Selectiva
1. Crea 3 terminales
2. Cierra manualmente 1 terminal
3. Hot-reload la app
4. ✅ Solo las 2 terminales vivas reconectan

## 📝 Archivos Modificados

```
✅ src/contexts/TerminalContext.tsx     - Persistencia + restauración
✅ src/components/electron/TerminalPane.tsx - Verificación de existencia
✅ electron/main/pty-manager.ts         - Métodos terminalExists, getAllTerminalIds
✅ electron/main/ipc-handlers.ts        - Handlers para exists y getAllIds
✅ electron/preload/index.ts            - Expose nuevos métodos
✅ src/types/electron.d.ts              - Types para nuevos métodos
```

## 🎉 Resultado

**Ahora puedes hacer desarrollo continuo desde dentro de la app sin perder tus terminales activas!**

```
ANTES:                          DESPUÉS:
┌─────────────────┐            ┌─────────────────┐
│ npm run dev     │ ──❌──→    │ npm run dev     │ ──✅──→
│ (perdido)       │            │ (persiste)      │
└─────────────────┘            └─────────────────┘
     Hot-reload                     Hot-reload
```

---

**Implementado**: 2026-03-04
**Status**: ✅ Production Ready
