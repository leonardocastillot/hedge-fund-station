import { useEffect } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  handler: () => void;
  description: string;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditableTarget = Boolean(
        target &&
        (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable
        )
      );

      if (isEditableTarget && !event.ctrlKey && !event.altKey && !event.metaKey) {
        return;
      }

      // Find matching shortcut
      const shortcut = shortcuts.find(s => {
        const keyMatches = s.key.toLowerCase() === event.key.toLowerCase();
        const ctrlMatches = s.ctrlKey === event.ctrlKey || s.ctrlKey === undefined;
        const shiftMatches = s.shiftKey === event.shiftKey || s.shiftKey === undefined;
        const altMatches = s.altKey === event.altKey || s.altKey === undefined;

        return keyMatches && ctrlMatches && shiftMatches && altMatches;
      });

      if (shortcut) {
        // Prevent default behavior for matched shortcuts
        event.preventDefault();
        event.stopPropagation();
        shortcut.handler();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcuts]);
}

export function getKeyboardShortcutsHelp(): KeyboardShortcut[] {
  return [
    { key: 't', ctrlKey: true, handler: () => {}, description: 'New Terminal' },
    { key: 'w', ctrlKey: true, handler: () => {}, description: 'Close Terminal' },
    { key: ',', ctrlKey: true, handler: () => {}, description: 'Settings' },
    { key: 'c', ctrlKey: true, shiftKey: true, handler: () => {}, description: 'Copy from Terminal' },
    { key: 'v', ctrlKey: true, shiftKey: true, handler: () => {}, description: 'Paste to Terminal' },
    { key: '1', ctrlKey: true, handler: () => {}, description: 'Switch to Desk 1' },
    { key: '2', ctrlKey: true, handler: () => {}, description: 'Switch to Desk 2' },
    { key: '3', ctrlKey: true, handler: () => {}, description: 'Switch to Desk 3' },
    { key: '4', ctrlKey: true, handler: () => {}, description: 'Switch to Desk 4' },
    { key: '5', ctrlKey: true, handler: () => {}, description: 'Switch to Desk 5' },
    { key: '6', ctrlKey: true, handler: () => {}, description: 'Switch to Desk 6' },
    { key: '7', ctrlKey: true, handler: () => {}, description: 'Switch to Desk 7' },
    { key: '8', ctrlKey: true, handler: () => {}, description: 'Switch to Desk 8' },
    { key: '9', ctrlKey: true, handler: () => {}, description: 'Switch to Desk 9' }
  ];
}
