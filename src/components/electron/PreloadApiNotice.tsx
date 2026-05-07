import React from 'react';

const REQUIRED_API_PATHS = [
  'obsidian.getStatus',
  'obsidian.ensureVault',
  'obsidian.listNotes',
  'obsidian.searchRelevant',
  'obsidian.listPinned',
  'obsidian.getGraph',
  'obsidian.syncStrategyMemory',
  'obsidian.exportMission',
  'obsidian.openPath',
  'obsidian.openVault'
];

function hasApiPath(root: unknown, path: string): boolean {
  const segments = path.split('.');
  let current: any = root;

  for (const segment of segments) {
    if (!current || typeof current !== 'object' || typeof current[segment] === 'undefined') {
      return false;
    }
    current = current[segment];
  }

  return typeof current === 'function';
}

export const PreloadApiNotice: React.FC = () => {
  const [missingPaths, setMissingPaths] = React.useState<string[]>([]);

  const checkApi = React.useCallback(() => {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI) {
      setMissingPaths([]);
      return;
    }

    const missing = REQUIRED_API_PATHS.filter((path) => !hasApiPath(electronAPI, path));
    setMissingPaths(missing);
  }, []);

  React.useEffect(() => {
    checkApi();
    window.addEventListener('focus', checkApi);
    document.addEventListener('visibilitychange', checkApi);
    return () => {
      window.removeEventListener('focus', checkApi);
      document.removeEventListener('visibilitychange', checkApi);
    };
  }, [checkApi]);

  if (missingPaths.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        padding: '10px 12px',
        margin: '8px 20px 0 20px',
        borderRadius: '12px',
        border: '1px solid rgba(245, 158, 11, 0.28)',
        background: 'rgba(245, 158, 11, 0.12)',
        display: 'flex',
        justifyContent: 'space-between',
        gap: '12px',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}
    >
      <div>
        <div style={{ color: '#fde68a', fontSize: '12px', fontWeight: 800 }}>
          Preload API out of date
        </div>
        <div style={{ color: '#fcd34d', fontSize: '11px', marginTop: '4px', lineHeight: 1.45 }}>
          Missing: {missingPaths.join(', ')}. Reload the app so the new Electron preload methods become available.
        </div>
      </div>

      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          padding: '8px 12px',
          borderRadius: '10px',
          border: '1px solid rgba(245, 158, 11, 0.32)',
          background: 'rgba(245, 158, 11, 0.18)',
          color: '#fef3c7',
          fontSize: '11px',
          fontWeight: 700,
          cursor: 'pointer'
        }}
      >
        Reload App
      </button>
    </div>
  );
};
