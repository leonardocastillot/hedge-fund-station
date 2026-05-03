import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Database, RefreshCcw } from 'lucide-react';
import { hyperliquidService } from '@/services/hyperliquidService';

type PresetId =
  | 'overview'
  | 'detail'
  | 'watchlist'
  | 'history'
  | 'alerts'
  | 'paper-signals'
  | 'paper-trades'
  | 'paper-session'
  | 'liquidations-status'
  | 'liquidations-snapshots'
  | 'liquidations-alerts'
  | 'liquidations-chart'
  | 'liquidations-insights'
  | 'orderbook'
  | 'candles'
  | 'trades'
  | 'custom';

type FlatRecord = Record<string, unknown>;

type Dataset = {
  id: string;
  label: string;
  rows: FlatRecord[];
  sourceType: 'array' | 'object';
  path: string;
};

type SummaryCard = {
  label: string;
  value: string;
  tone?: 'neutral' | 'cyan' | 'amber';
};

type DatasetInsight = {
  missingCells: number;
  duplicateRows: number;
  outlierRows: number;
  suspiciousNegativeRows: number;
  completenessPct: number;
};

type ColumnInsight = {
  key: string;
  nullCount: number;
  uniqueCount: number;
  outlierCount: number;
  suspiciousNegativeCount: number;
};

const PRESETS: Array<{ id: PresetId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'detail', label: 'Detail' },
  { id: 'watchlist', label: 'Watchlist' },
  { id: 'history', label: 'History' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'paper-signals', label: 'Paper Signals' },
  { id: 'paper-trades', label: 'Paper Trades' },
  { id: 'paper-session', label: 'Session Analytics' },
  { id: 'liquidations-status', label: 'Pressure Status' },
  { id: 'liquidations-snapshots', label: 'Pressure Snapshots' },
  { id: 'liquidations-alerts', label: 'Pressure Alerts' },
  { id: 'liquidations-chart', label: 'Pressure Chart' },
  { id: 'liquidations-insights', label: 'Pressure Insights' },
  { id: 'orderbook', label: 'Orderbook' },
  { id: 'candles', label: 'Candles' },
  { id: 'trades', label: 'Trades' },
  { id: 'custom', label: 'Custom' }
];

function buildPath(params: {
  preset: PresetId;
  symbol: string;
  interval: string;
  limit: string;
  customPath: string;
}) {
  const symbol = params.symbol.trim() || 'BTC';
  const interval = params.interval.trim() || '1h';
  const limit = params.limit.trim() || '50';

  switch (params.preset) {
    case 'overview':
      return `/api/hyperliquid/overview?limit=${encodeURIComponent(limit)}`;
    case 'detail':
      return `/api/hyperliquid/detail/${symbol}?interval=${encodeURIComponent(interval)}&lookback_hours=24`;
    case 'watchlist':
      return `/api/hyperliquid/watchlist?limit=${encodeURIComponent(limit)}`;
    case 'history':
      return `/api/hyperliquid/history/${symbol}?limit=${encodeURIComponent(limit)}`;
    case 'alerts':
      return `/api/hyperliquid/alerts?limit=${encodeURIComponent(limit)}`;
    case 'paper-signals':
      return `/api/hyperliquid/paper/signals?limit=${encodeURIComponent(limit)}`;
    case 'paper-trades':
      return `/api/hyperliquid/paper/trades?status=all`;
    case 'paper-session':
      return `/api/hyperliquid/paper/session-analytics`;
    case 'liquidations-status':
      return `/api/liquidations/status`;
    case 'liquidations-snapshots':
      return `/api/liquidations/snapshots?limit=${encodeURIComponent(limit)}`;
    case 'liquidations-alerts':
      return `/api/liquidations/alerts?limit=${encodeURIComponent(limit)}`;
    case 'liquidations-chart':
      return `/api/liquidations/chart-data?hours=24`;
    case 'liquidations-insights':
      return `/api/liquidations/insights`;
    case 'orderbook':
      return `/api/hyperliquid/orderbook/${symbol}`;
    case 'candles':
      return `/api/hyperliquid/candles/${symbol}?interval=${encodeURIComponent(interval)}&lookback_hours=24`;
    case 'trades':
      return `/api/hyperliquid/trades/${symbol}?limit=${encodeURIComponent(limit)}`;
    case 'custom':
    default:
      return params.customPath.trim() || '/api/hyperliquid/overview?limit=20';
  }
}

function formatPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'N/A';
  }
  return `${value.toFixed(digits)}%`;
}

function formatCell(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return 'N/A';
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(Math.abs(value) >= 100 ? 2 : 4);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (Array.isArray(value)) {
    return `${value.length} items`;
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function classifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}

function normalizeRow(value: unknown): FlatRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as FlatRecord;
  }
  return { value };
}

function dedupeDatasets(datasets: Dataset[]) {
  const seen = new Set<string>();
  return datasets.filter((dataset) => {
    if (seen.has(dataset.id)) {
      return false;
    }
    seen.add(dataset.id);
    return true;
  });
}

function collectDatasets(value: unknown, path = 'root', label = 'Payload'): Dataset[] {
  if (Array.isArray(value)) {
    return [{ id: path, label, rows: value.map(normalizeRow), sourceType: 'array', path }];
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  const record = value as FlatRecord;
  const datasets: Dataset[] = [];

  for (const [key, nested] of Object.entries(record)) {
    if (Array.isArray(nested)) {
      datasets.push({
        id: `${path}.${key}`,
        label: key,
        rows: nested.map(normalizeRow),
        sourceType: 'array',
        path: `${path}.${key}`
      });
      continue;
    }

    if (nested && typeof nested === 'object') {
      const childRecord = nested as FlatRecord;
      const nestedArrays = Object.entries(childRecord).filter(([, childValue]) => Array.isArray(childValue));
      for (const [childKey, childValue] of nestedArrays) {
        datasets.push({
          id: `${path}.${key}.${childKey}`,
          label: `${key}.${childKey}`,
          rows: (childValue as unknown[]).map(normalizeRow),
          sourceType: 'array',
          path: `${path}.${key}.${childKey}`
        });
      }
      datasets.push({
        id: `${path}.${key}.__object__`,
        label: key,
        rows: [childRecord],
        sourceType: 'object',
        path: `${path}.${key}`
      });
    }
  }

  if (datasets.length === 0) {
    datasets.push({
      id: `${path}.__object__`,
      label,
      rows: [record],
      sourceType: 'object',
      path
    });
  }

  return dedupeDatasets(datasets);
}

function inferColumns(rows: FlatRecord[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1];
      }
      return a[0].localeCompare(b[0]);
    })
    .map(([key]) => key);
}

function numericValues(rows: FlatRecord[], key: string) {
  return rows
    .map((row) => row[key])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function quantile(values: number[], percentile: number) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sorted[lower];
  }
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function buildColumnInsights(rows: FlatRecord[], columns: string[]): ColumnInsight[] {
  return columns.map((key) => {
    const values = rows.map((row) => row[key]);
    const nullCount = values.filter((value) => value === null || value === undefined || value === '').length;
    const uniqueCount = new Set(values.map((value) => JSON.stringify(value))).size;
    const numeric = numericValues(rows, key);
    const q1 = quantile(numeric, 0.25);
    const q3 = quantile(numeric, 0.75);
    const iqr = q1 !== null && q3 !== null ? q3 - q1 : null;
    const lower = q1 !== null && iqr !== null ? q1 - 1.5 * iqr : null;
    const upper = q3 !== null && iqr !== null ? q3 + 1.5 * iqr : null;
    const outlierCount = lower === null || upper === null ? 0 : numeric.filter((value) => value < lower || value > upper).length;
    const suspiciousField = /(price|usd|volume|notional|depth|interest|size|value|pnl)/i.test(key);
    const suspiciousNegativeCount = suspiciousField ? numeric.filter((value) => value < 0).length : 0;
    return { key, nullCount, uniqueCount, outlierCount, suspiciousNegativeCount };
  });
}

function rowFingerprint(row: FlatRecord, columns: string[]) {
  const priorityKeys = ['id', 'symbol', 'time', 'timestamp', 'createdAt', 'timestamp_ms'];
  const availablePriority = priorityKeys.filter((key) => key in row);
  const fingerprintKeys = availablePriority.length > 0 ? availablePriority : columns.slice(0, 6);
  return JSON.stringify(fingerprintKeys.map((key) => [key, row[key]]));
}

function buildDatasetInsight(rows: FlatRecord[], columns: string[], columnInsights: ColumnInsight[]): DatasetInsight {
  const totalCells = rows.length * Math.max(columns.length, 1);
  const missingCells = columnInsights.reduce((sum, item) => sum + item.nullCount, 0);
  const completenessPct = totalCells === 0 ? 100 : ((totalCells - missingCells) / totalCells) * 100;

  const fingerprints = new Map<string, number>();
  for (const row of rows) {
    const fingerprint = rowFingerprint(row, columns);
    fingerprints.set(fingerprint, (fingerprints.get(fingerprint) || 0) + 1);
  }

  const duplicateRows = [...fingerprints.values()].reduce((sum, count) => sum + (count > 1 ? count - 1 : 0), 0);
  const outlierRows = Math.max(...columnInsights.map((item) => item.outlierCount), 0);
  const suspiciousNegativeRows = Math.max(...columnInsights.map((item) => item.suspiciousNegativeCount), 0);

  return {
    missingCells,
    duplicateRows,
    outlierRows,
    suspiciousNegativeRows,
    completenessPct
  };
}

function sortRows(rows: FlatRecord[], sortKey: string, direction: 'asc' | 'desc') {
  const factor = direction === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => {
    const leftValue = left[sortKey];
    const rightValue = right[sortKey];
    if (leftValue === rightValue) {
      return 0;
    }
    if (leftValue === null || leftValue === undefined) {
      return 1;
    }
    if (rightValue === null || rightValue === undefined) {
      return -1;
    }
    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      return (leftValue - rightValue) * factor;
    }
    return String(leftValue).localeCompare(String(rightValue)) * factor;
  });
}

function buildSummaryCards(data: unknown, datasets: Dataset[], selectedDataset: Dataset | null, selectedInsight: DatasetInsight | null): SummaryCard[] {
  const totalRows = datasets.reduce((sum, dataset) => sum + dataset.rows.length, 0);
  const topLevelKeys = data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data as FlatRecord).length : 0;
  return [
    { label: 'Payload Type', value: classifyValue(data), tone: 'neutral' },
    { label: 'Top-level Keys', value: String(topLevelKeys), tone: 'neutral' },
    { label: 'Datasets', value: String(datasets.length), tone: 'cyan' },
    { label: 'Rows Visible', value: String(selectedDataset?.rows.length || 0), tone: 'cyan' },
    { label: 'Rows Total', value: String(totalRows), tone: 'neutral' },
    {
      label: 'Completeness',
      value: selectedInsight ? formatPercent(selectedInsight.completenessPct, 0) : 'N/A',
      tone: selectedInsight && selectedInsight.completenessPct < 85 ? 'amber' : 'cyan'
    }
  ];
}

export default function HyperliquidDataPage() {
  const [preset, setPreset] = useState<PresetId>('overview');
  const [symbol, setSymbol] = useState('BTC');
  const [interval, setInterval] = useState('1h');
  const [limit, setLimit] = useState('50');
  const [customPath, setCustomPath] = useState('/api/hyperliquid/overview?limit=20');
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datasetId, setDatasetId] = useState('');
  const [rowQuery, setRowQuery] = useState('');
  const [sortKey, setSortKey] = useState('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const [showRawJson, setShowRawJson] = useState(false);

  const path = useMemo(() => buildPath({ preset, symbol, interval, limit, customPath }), [preset, symbol, interval, limit, customPath]);
  const datasets = useMemo(() => collectDatasets(data), [data]);

  useEffect(() => {
    if (datasets.length === 0) {
      setDatasetId('');
      return;
    }
    if (!datasets.some((dataset) => dataset.id === datasetId)) {
      setDatasetId(datasets[0].id);
    }
  }, [datasetId, datasets]);

  const selectedDataset = useMemo(() => datasets.find((dataset) => dataset.id === datasetId) || datasets[0] || null, [datasetId, datasets]);
  const columns = useMemo(() => inferColumns(selectedDataset?.rows || []), [selectedDataset]);
  const columnInsights = useMemo(() => buildColumnInsights(selectedDataset?.rows || [], columns), [columns, selectedDataset]);
  const datasetInsight = useMemo(
    () => (selectedDataset ? buildDatasetInsight(selectedDataset.rows, columns, columnInsights) : null),
    [columnInsights, columns, selectedDataset]
  );

  const filteredRows = useMemo(() => {
    const source = selectedDataset?.rows || [];
    const query = rowQuery.trim().toLowerCase();
    const rows = query
      ? source.filter((row) => columns.some((key) => formatCell(row[key]).toLowerCase().includes(query)))
      : source;
    if (!sortKey || !columns.includes(sortKey)) {
      return rows;
    }
    return sortRows(rows, sortKey, sortDirection);
  }, [columns, rowQuery, selectedDataset, sortDirection, sortKey]);

  useEffect(() => {
    setSelectedRowIndex(0);
    if (columns.length > 0 && (!sortKey || !columns.includes(sortKey))) {
      setSortKey(columns[0]);
      setSortDirection('desc');
    }
  }, [columns, sortKey]);

  const selectedRow = filteredRows[selectedRowIndex] || filteredRows[0] || null;
  const summaryCards = useMemo(() => buildSummaryCards(data, datasets, selectedDataset, datasetInsight), [data, datasetInsight, datasets, selectedDataset]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      try {
        const next = await hyperliquidService.getRaw(path);
        if (mounted) {
          setData(next);
          setError(null);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message || 'No se pudo cargar el endpoint.');
          setData(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [path]);

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.12),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.08),_transparent_24%),linear-gradient(180deg,#020617_0%,#07111d_100%)] p-4">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <section className="rounded-[28px] border border-cyan-500/20 bg-black/35 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-300/70">Data Control</div>
              <div className="mt-1 text-2xl font-semibold text-white">Panel de inspeccion para revisar toda la data y detectar irregularidades.</div>
              <div className="mt-2 max-w-3xl text-sm text-white/55">
                Esta vista prioriza datasets navegables, calidad de datos y detalle por registro. El JSON crudo queda como apoyo secundario.
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-right">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Endpoint activo</div>
              <div className="mt-2 max-w-[28rem] break-all text-sm text-cyan-100">{loading ? 'Loading...' : path}</div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {PRESETS.map((item) => {
              const active = preset === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPreset(item.id)}
                  className={`rounded-full border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition ${
                    active ? 'border-cyan-500/35 bg-cyan-500/15 text-cyan-100' : 'border-white/10 bg-white/[0.03] text-white/55 hover:border-white/20 hover:text-white/80'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <input
              value={symbol}
              onChange={(event) => setSymbol(event.target.value.toUpperCase())}
              placeholder="Symbol"
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none"
            />
            <input
              value={interval}
              onChange={(event) => setInterval(event.target.value)}
              placeholder="Interval"
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none"
            />
            <input
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
              placeholder="Limit"
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none"
            />
            <button
              type="button"
              onClick={() => setCustomPath(path)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-3 text-sm font-semibold text-cyan-100"
            >
              <RefreshCcw className="h-4 w-4" />
              Sync Path
            </button>
          </div>

          <input
            value={customPath}
            onChange={(event) => setCustomPath(event.target.value)}
            placeholder="/api/hyperliquid/overview?limit=20"
            className="mt-3 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none"
          />

          {error ? <div className="mt-3 rounded-2xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            {summaryCards.map((card) => (
              <SummaryTile key={card.label} card={card} />
            ))}
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="grid gap-4">
            <Panel title="Datasets">
              {datasets.length === 0 ? (
                <EmptyState copy="Este payload no trae colecciones navegables todavia." />
              ) : (
                <div className="grid gap-3">
                  {datasets.map((dataset) => {
                    const active = selectedDataset?.id === dataset.id;
                    const datasetColumns = inferColumns(dataset.rows);
                    const insights = buildDatasetInsight(dataset.rows, datasetColumns, buildColumnInsights(dataset.rows, datasetColumns));
                    return (
                      <button
                        key={dataset.id}
                        type="button"
                        onClick={() => setDatasetId(dataset.id)}
                        className={`rounded-2xl border p-4 text-left transition ${
                          active ? 'border-cyan-500/35 bg-cyan-500/10' : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-white">{dataset.label}</div>
                            <div className="mt-1 truncate text-[11px] uppercase tracking-[0.16em] text-white/35">{dataset.path}</div>
                          </div>
                          <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">
                            {dataset.sourceType}
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-white/70">
                          <MiniMetric label="Rows" value={String(dataset.rows.length)} />
                          <MiniMetric label="Cols" value={String(datasetColumns.length)} />
                          <MiniMetric label="Nulls" value={String(insights.missingCells)} />
                          <MiniMetric label="Outliers" value={String(insights.outlierRows)} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </Panel>

            <Panel title="Irregularidades">
              {!datasetInsight ? (
                <EmptyState copy="Selecciona un dataset para revisar calidad." />
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  <AlertTile
                    label="Celdas faltantes"
                    value={String(datasetInsight.missingCells)}
                    copy="Campos nulos, vacios o ausentes dentro de la tabla actual."
                    tone={datasetInsight.missingCells > 0 ? 'amber' : 'neutral'}
                  />
                  <AlertTile
                    label="Filas duplicadas"
                    value={String(datasetInsight.duplicateRows)}
                    copy="Se calcula con claves prioritarias como id, symbol, time o equivalentes."
                    tone={datasetInsight.duplicateRows > 0 ? 'amber' : 'neutral'}
                  />
                  <AlertTile
                    label="Outliers numericos"
                    value={String(datasetInsight.outlierRows)}
                    copy="Valores fuera del rango intercuartil detectados por columna."
                    tone={datasetInsight.outlierRows > 0 ? 'amber' : 'neutral'}
                  />
                  <AlertTile
                    label="Negativos sospechosos"
                    value={String(datasetInsight.suspiciousNegativeRows)}
                    copy="Negativos en campos como price, usd, volume, size, value o pnl."
                    tone={datasetInsight.suspiciousNegativeRows > 0 ? 'amber' : 'neutral'}
                  />
                </div>
              )}
            </Panel>

            <Panel title="Columnas">
              {columnInsights.length === 0 ? (
                <EmptyState copy="No hay columnas para perfilar en este dataset." />
              ) : (
                <div className="overflow-auto">
                  <div className="min-w-[560px]">
                    <div className="grid grid-cols-[minmax(140px,1.4fr)_80px_80px_90px_100px] gap-3 border-b border-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
                      <span>Campo</span>
                      <span>Nulos</span>
                      <span>Unicos</span>
                      <span>Outliers</span>
                      <span>Negativos</span>
                    </div>
                    {columnInsights.slice(0, 18).map((item) => (
                      <div key={item.key} className="grid grid-cols-[minmax(140px,1.4fr)_80px_80px_90px_100px] gap-3 border-b border-white/5 px-3 py-3 text-sm text-white/70">
                        <span className="truncate text-white">{item.key}</span>
                        <span>{item.nullCount}</span>
                        <span>{item.uniqueCount}</span>
                        <span className={item.outlierCount > 0 ? 'text-amber-200' : ''}>{item.outlierCount}</span>
                        <span className={item.suspiciousNegativeCount > 0 ? 'text-amber-200' : ''}>{item.suspiciousNegativeCount}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Panel>
          </div>

          <div className="grid gap-4">
            <Panel title="Tabla navegable">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  value={rowQuery}
                  onChange={(event) => setRowQuery(event.target.value)}
                  placeholder="Buscar en filas y columnas"
                  className="min-w-[240px] flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none"
                />
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/65">
                  {filteredRows.length} filas visibles
                </div>
              </div>

              {filteredRows.length === 0 || columns.length === 0 ? (
                <div className="mt-4">
                  <EmptyState copy="No hay filas para mostrar con los filtros actuales." />
                </div>
              ) : (
                <div className="mt-4 overflow-auto rounded-2xl border border-white/10">
                  <table className="min-w-full text-left text-sm text-white/80">
                    <thead className="sticky top-0 bg-[#08111c] text-[10px] uppercase tracking-[0.18em] text-white/35">
                      <tr>
                        {columns.slice(0, 10).map((key) => {
                          const active = sortKey === key;
                          return (
                            <th key={key} className="border-b border-white/10 px-3 py-3">
                              <button
                                type="button"
                                onClick={() => {
                                  if (sortKey === key) {
                                    setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
                                  } else {
                                    setSortKey(key);
                                    setSortDirection('desc');
                                  }
                                }}
                                className={`flex items-center gap-2 ${active ? 'text-cyan-100' : 'text-white/40'}`}
                              >
                                <span className="truncate">{key}</span>
                                {active ? <span>{sortDirection === 'asc' ? '^' : 'v'}</span> : null}
                              </button>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.slice(0, 120).map((row, index) => {
                        const active = filteredRows[selectedRowIndex] === row;
                        return (
                          <tr
                            key={`${index}-${rowFingerprint(row, columns)}`}
                            className={`cursor-pointer border-b border-white/5 ${active ? 'bg-cyan-500/10' : 'bg-transparent hover:bg-white/[0.03]'}`}
                            onClick={() => setSelectedRowIndex(index)}
                          >
                            {columns.slice(0, 10).map((key) => (
                              <td key={key} className="max-w-[220px] px-3 py-3 align-top text-white/70">
                                <div className="truncate">{formatCell(row[key])}</div>
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel title="Inspector de fila">
              {!selectedRow ? (
                <EmptyState copy="Haz click en una fila para abrir el detalle completo del registro." />
              ) : (
                <div className="grid gap-3">
                  <div className="grid gap-3 md:grid-cols-3">
                    <SummaryPill label="Fila" value={String(selectedRowIndex + 1)} />
                    <SummaryPill label="Campos" value={String(Object.keys(selectedRow).length)} />
                    <SummaryPill
                      label="Campos vacios"
                      value={String(Object.values(selectedRow).filter((value) => value === null || value === undefined || value === '').length)}
                    />
                  </div>

                  <div className="grid gap-2">
                    {Object.entries(selectedRow).map(([key, value]) => {
                      const missing = value === null || value === undefined || value === '';
                      return (
                        <div key={key} className={`rounded-2xl border p-3 ${missing ? 'border-amber-500/25 bg-amber-500/10' : 'border-white/10 bg-white/[0.03]'}`}>
                          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">{key}</div>
                          <div className="mt-2 break-words text-sm text-white/80">{formatCell(value)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Panel>

            <Panel title="Raw JSON secundario">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-white/55">Se mantiene solo para debugging puntual, no como vista principal.</div>
                <button
                  type="button"
                  onClick={() => setShowRawJson((current) => !current)}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70"
                >
                  {showRawJson ? 'Ocultar JSON' : 'Mostrar JSON'}
                </button>
              </div>
              {showRawJson ? (
                <pre className="mt-4 max-h-[36rem] overflow-auto rounded-2xl border border-white/10 bg-[#020617] p-4 text-xs leading-6 text-cyan-100">
                  {JSON.stringify(data, null, 2)}
                </pre>
              ) : null}
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[24px] border border-white/10 bg-black/25 p-4">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">
        <Database className="h-4 w-4 text-cyan-300" />
        {title}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function EmptyState({ copy }: { copy: string }) {
  return <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-white/50">{copy}</div>;
}

function SummaryTile({ card }: { card: SummaryCard }) {
  const toneClass =
    card.tone === 'amber'
      ? 'border-amber-500/20 bg-amber-500/10'
      : card.tone === 'cyan'
        ? 'border-cyan-500/20 bg-cyan-500/10'
        : 'border-white/10 bg-white/[0.03]';

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">{card.label}</div>
      <div className="mt-2 text-lg font-semibold text-white">{card.value}</div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">{label}</div>
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function AlertTile({
  label,
  value,
  copy,
  tone
}: {
  label: string;
  value: string;
  copy: string;
  tone: 'neutral' | 'amber';
}) {
  return (
    <div className={`rounded-2xl border p-4 ${tone === 'amber' ? 'border-amber-500/25 bg-amber-500/10' : 'border-white/10 bg-white/[0.03]'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">{label}</div>
          <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
        </div>
        <AlertTriangle className={`h-5 w-5 ${tone === 'amber' ? 'text-amber-300' : 'text-white/30'}`} />
      </div>
      <div className="mt-2 text-sm text-white/55">{copy}</div>
    </div>
  );
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">{label}</div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}
