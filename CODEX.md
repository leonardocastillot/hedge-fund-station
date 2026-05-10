# CODEX

## Estado actual
- Proyecto Electron + React + node-pty orientado a terminales de trabajo pesado.
- Se priorizo estabilidad de sesiones largas con CLIs tipo `claude`, `codex`, `gemini`, `npm run dev` y procesos backend concurrentes.
- El efecto arcoiris se mantiene como senal visual de la terminal activa/en uso.
- Para trabajo de agente, leer `AGENTS.md` y `RTK.md`; usar `rtk <comando>` por defecto para reducir ruido de salida.

## Optimizaciones aplicadas
- PTY output batching en main process para reducir spam IPC.
- Buffered writes hacia xterm en renderer con `requestAnimationFrame`.
- Debounce de `ResizeObserver` en terminales.
- `TerminalPane` memoizado para bajar renders innecesarios.
- Persistencia de sesiones de terminal con debounce.
- WebSocket de liquidaciones con cola y flush agrupado para reducir `setState`.
- `Settings` conectados a terminales para `defaultShell`, `fontSize` y `scrollbackLines`.

## Archivos clave
- `electron/main/pty-manager.ts`
- `src/components/electron/TerminalPane.tsx`
- `src/components/electron/TerminalGrid.tsx`
- `src/contexts/TerminalContext.tsx`
- `src/contexts/LiquidationsContext.tsx`
- `src/utils/appSettings.ts`

## Pendientes importantes
- Limpiar errores TypeScript existentes fuera de la ruta de terminales.
- Revisar `src/pages/PortfolioDashboardPage.tsx` por propiedad `mode`.
- Considerar store mas granular para terminales si escala el numero de paneles y widgets.
- Medir renderer/main process con profiling real en sesiones largas.

## Recuperacion si algo se cae
1. Revisar `src/components/electron/TerminalPane.tsx` y `electron/main/pty-manager.ts`.
2. Si falla el render de terminal, revertir primero batching/buffering antes de tocar persistencia.
3. Validar `npx.cmd tsc --noEmit`.
4. Validar apertura/cierre de terminal, restore tras reload y resize.
5. Verificar backend websocket de liquidaciones y que no haya flood de renders.

## Proximo enfoque recomendado
- Fase 1: limpiar TypeScript restante.
- Fase 2: reducir renders globales con selectors/store mas fino.
- Fase 3: agregar metricas internas de rendimiento para renderer, PTY y websocket.
