import { useEffect, useCallback, useRef } from 'react';

interface UseTerminalOptions {
  onData?: (data: string) => void;
  onExit?: (exitCode: number) => void;
}

export function useTerminal(id: string, options: UseTerminalOptions = {}) {
  const { onData, onExit } = options;
  const onDataRef = useRef(onData);
  const onExitRef = useRef(onExit);

  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);

  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  // Write data to terminal
  const write = useCallback((data: string) => {
    window.electronAPI.terminal.write(id, data);
  }, [id]);

  // Resize terminal
  const resize = useCallback((cols: number, rows: number) => {
    window.electronAPI.terminal.resize(id, cols, rows);
  }, [id]);

  // Kill terminal
  const kill = useCallback(() => {
    window.electronAPI.terminal.kill(id);
  }, [id]);

  const getSnapshot = useCallback(() => {
    if (typeof window.electronAPI.terminal.getSnapshot !== 'function') {
      return Promise.resolve(null);
    }

    return window.electronAPI.terminal.getSnapshot(id);
  }, [id]);

  // Listen for terminal data
  useEffect(() => {
    const cleanup = window.electronAPI.terminal.onData(id, (data) => {
      if (onDataRef.current) {
        onDataRef.current(data.data);
      }
    });

    return cleanup;
  }, [id]);

  // Listen for terminal exit
  useEffect(() => {
    const cleanup = window.electronAPI.terminal.onExit(id, (data) => {
      if (onExitRef.current) {
        onExitRef.current(data.exitCode);
      }
    });

    return cleanup;
  }, [id]);

  return {
    write,
    resize,
    kill,
    getSnapshot
  };
}
