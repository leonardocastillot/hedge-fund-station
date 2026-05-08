import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Area, Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { HyperliquidBacktestArtifactSummary } from '@/services/hyperliquidService';

type TradeFilter = 'all' | 'winners' | 'losers' | 'open-paper';

export type NormalizedTrade = {
  id: string;
  source: 'backtest' | 'paper';
  symbol: string;
  side: string;
  status: string;
  entryTime: string | number | null;
  exitTime: string | number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  sizeUsd: number | null;
  grossPnl: number | null;
  netPnl: number | null;
  returnPct: number | null;
  fees: number | null;
  exitReason: string | null;
  thesis: string | null;
  triggerPlan: string | null;
  invalidationPlan: string | null;
  filtersPassed: Record<string, string>;
  filtersFailed: Record<string, string>;
  reasons: string[];
};

type TradeChartPoint = {
  index: number;
  label: string;
  symbol: string;
  side: string;
  pnl: number;
  cumulativePnl: number;
  returnPct: number | null;
  drawdown: number;
  source: string;
};

export function BacktestArtifactSelector({
  strategyId,
  artifacts,
  selectedArtifactId,
  loading,
  onSelect
}: {
  strategyId: string;
  artifacts: HyperliquidBacktestArtifactSummary[];
  selectedArtifactId: string | null;
  loading: boolean;
  onSelect: (artifactId: string) => void;
}) {
  if (!loading && artifacts.length === 0) {
    return null;
  }

  const selected = artifacts.find((artifact) => artifact.artifactId === selectedArtifactId) ?? artifacts[0] ?? null;
  const summary = selected?.summary ?? {};
  const returnPct = Number(summary.return_pct ?? 0);

  return (
    <Panel title="Backtest Artifacts">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0">
          <select
            value={selectedArtifactId ?? ''}
            disabled={loading || artifacts.length === 0}
            onChange={(event) => onSelect(event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm font-semibold text-white outline-none transition focus:border-cyan-400/60 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {artifacts.map((artifact) => (
              <option key={artifact.artifactId} value={artifact.artifactId}>
                {formatArtifactDate(artifact.generatedAt)} | {artifact.summary.total_trades ?? 0} trades | {formatArtifactPercent(artifact.summary.return_pct)} | {artifact.robustAssessment?.status ?? 'robust N/D'}
              </option>
            ))}
          </select>
          <div className="mt-2 truncate text-xs text-white/40">
            {selected ? selected.artifactId : loading ? `Loading artifacts for ${strategyId}` : 'No artifacts found'}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <MiniMetric label="Return" value={formatArtifactPercent(summary.return_pct)} detail={`${summary.total_trades ?? 0} trades`} tone={returnPct >= 0 ? 'text-emerald-300' : 'text-rose-300'} />
          <MiniMetric label="PF" value={formatArtifactNumber(summary.profit_factor)} detail={selected?.robustAssessment?.status ?? 'N/D'} />
          <MiniMetric label="Validation" value={selected?.validationStatus ?? 'N/D'} detail={selected?.validationPath ? 'matched report' : 'not matched'} />
        </div>
      </div>
    </Panel>
  );
}

export function TradesSection({
  trades,
  expectedTrades,
  artifactPath,
  artifactError,
  loadingEvidence,
  emptyAction
}: {
  trades: NormalizedTrade[];
  expectedTrades: number | null;
  artifactPath: string | null;
  artifactError: string | null;
  loadingEvidence: boolean;
  emptyAction: string;
}) {
  const [filter, setFilter] = useState<TradeFilter>('all');
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null);
  const summary = useMemo(() => summarizeTrades(trades), [trades]);
  const chartData = useMemo(() => buildTradeChartData(trades), [trades]);
  const filteredTrades = useMemo(() => {
    if (filter === 'winners') return trades.filter((trade) => (trade.netPnl ?? 0) > 0);
    if (filter === 'losers') return trades.filter((trade) => (trade.netPnl ?? 0) < 0);
    if (filter === 'open-paper') return trades.filter((trade) => trade.source === 'paper' && trade.status === 'open');
    return trades;
  }, [filter, trades]);
  const filters: Array<{ id: TradeFilter; label: string }> = [
    { id: 'all', label: `All ${trades.length}` },
    { id: 'winners', label: `Winners ${summary.wins}` },
    { id: 'losers', label: `Losers ${summary.losses}` },
    { id: 'open-paper', label: `Open/Paper ${trades.filter((trade) => trade.source === 'paper' && trade.status === 'open').length}` }
  ];

  return (
    <Panel title="Trades Ledger">
      <div className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-6">
          <MiniMetric label="Rows" value={String(summary.total)} detail={expectedTrades === null ? 'backend evidence' : `${expectedTrades} expected`} />
          <MiniMetric label="Wins" value={String(summary.wins)} detail={`${summary.losses} losses`} />
          <MiniMetric label="Net PnL" value={formatCurrency(summary.netPnl)} detail={`${formatCurrency(summary.fees)} fees`} tone={pnlTone(summary.netPnl)} />
          <MiniMetric label="Best" value={summary.best ? formatCurrency(summary.best.netPnl ?? 0) : 'N/D'} detail={summary.best?.symbol ?? 'no trade'} tone={pnlTone(summary.best?.netPnl ?? null)} />
          <MiniMetric label="Worst" value={summary.worst ? formatCurrency(summary.worst.netPnl ?? 0) : 'N/D'} detail={summary.worst?.symbol ?? 'no trade'} tone={pnlTone(summary.worst?.netPnl ?? null)} />
          <MiniMetric label="Source" value={loadingEvidence ? 'Generating' : trades.some((trade) => trade.source === 'backtest') ? 'Artifact' : 'Ledger'} detail={loadingEvidence ? 'auto backtest running' : artifactPath ? 'backtest loaded' : 'paper/runtime only'} />
        </div>

        <TradeHistoryChart data={chartData} />

        {loadingEvidence ? (
          <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/10 p-4 text-sm text-cyan-50">
            Generating backtest evidence automatically. Trades and chart will load here when the backend finishes.
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {filters.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                  filter === item.id ? 'bg-cyan-300 text-slate-950' : 'border border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.08]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {artifactPath ? <div className="max-w-full truncate text-xs text-white/35">{artifactPath}</div> : null}
        </div>

        {trades.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.03] p-4 text-sm text-white/60">
            {artifactError || emptyAction}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-white/10">
            <div className="overflow-x-auto">
              <table className="min-w-[960px] w-full text-left text-sm">
                <thead className="border-b border-white/10 bg-white/[0.04] text-[10px] uppercase tracking-[0.16em] text-white/40">
                  <tr>
                    <th className="px-3 py-3">Time</th>
                    <th className="px-3 py-3">Symbol</th>
                    <th className="px-3 py-3">Side</th>
                    <th className="px-3 py-3">Entry</th>
                    <th className="px-3 py-3">Exit</th>
                    <th className="px-3 py-3 text-right">Size</th>
                    <th className="px-3 py-3 text-right">Net PnL</th>
                    <th className="px-3 py-3 text-right">Return</th>
                    <th className="px-3 py-3">Exit Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrades.map((trade) => (
                    <TradeRow
                      key={trade.id}
                      trade={trade}
                      expanded={expandedTradeId === trade.id}
                      onToggle={() => setExpandedTradeId((current) => current === trade.id ? null : trade.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {filteredTrades.length === 0 ? <div className="border-t border-white/10 p-4 text-sm text-white/55">No trades match this filter.</div> : null}
          </div>
        )}
      </div>
    </Panel>
  );
}

export function BacktestAction({
  strategyId,
  canRun = true,
  running,
  message,
  onRun
}: {
  strategyId: string;
  canRun?: boolean;
  running: boolean;
  message: string | null;
  onRun: () => void;
}) {
  const disabled = running || strategyId.startsWith('runtime:') || !canRun;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-500/15 bg-cyan-500/[0.06] p-3">
      <div>
        <div className="text-sm font-semibold text-cyan-100">Backend backtest API</div>
        <div className="mt-1 text-xs text-cyan-100/65">
          {strategyId.startsWith('runtime:')
            ? 'Runtime setup: seed paper evidence desde Paper Lab.'
            : canRun
              ? `Strategy ID: ${strategyId} | UI default lookback 3d`
              : 'Visible for review, but not registered for hf:backtest yet.'}
        </div>
        {message ? <div className="mt-2 text-xs text-white/70">{message}</div> : null}
      </div>
      <button
        type="button"
        onClick={onRun}
        disabled={disabled}
        className="rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {running ? 'Running...' : 'Run Backtest'}
      </button>
    </div>
  );
}

function summarizeTrades(trades: NormalizedTrade[]) {
  const closed = trades.filter((trade) => trade.netPnl !== null);
  const wins = closed.filter((trade) => (trade.netPnl ?? 0) > 0).length;
  const losses = closed.filter((trade) => (trade.netPnl ?? 0) < 0).length;
  const netPnl = closed.reduce((sum, trade) => sum + (trade.netPnl ?? 0), 0);
  const fees = trades.reduce((sum, trade) => sum + (trade.fees ?? 0), 0);
  const sorted = [...closed].sort((a, b) => (a.netPnl ?? 0) - (b.netPnl ?? 0));
  return {
    total: trades.length,
    wins,
    losses,
    netPnl,
    fees,
    best: sorted[sorted.length - 1] ?? null,
    worst: sorted[0] ?? null
  };
}

function buildTradeChartData(trades: NormalizedTrade[]): TradeChartPoint[] {
  const ordered = [...trades]
    .filter((trade) => trade.netPnl !== null)
    .sort((a, b) => parseTradeTime(a.entryTime) - parseTradeTime(b.entryTime));
  let cumulativePnl = 0;
  let peakPnl = 0;
  return ordered.map((trade, index) => {
    const pnl = trade.netPnl ?? 0;
    cumulativePnl += pnl;
    peakPnl = Math.max(peakPnl, cumulativePnl);
    return {
      index: index + 1,
      label: formatTradeTime(trade.entryTime),
      symbol: trade.symbol,
      side: trade.side,
      pnl,
      cumulativePnl,
      returnPct: trade.returnPct,
      drawdown: cumulativePnl - peakPnl,
      source: trade.source
    };
  });
}

function TradeHistoryChart({ data }: { data: TradeChartPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.02] text-sm text-white/45">
        No closed trade history to chart yet.
      </div>
    );
  }

  const last = data[data.length - 1];
  const bestPoint = data.reduce((best, point) => point.pnl > best.pnl ? point : best, data[0]);
  const worstPoint = data.reduce((worst, point) => point.pnl < worst.pnl ? point : worst, data[0]);

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">Trade History</div>
          <div className="mt-1 text-xs text-white/45">Cumulative PnL curve with each trade's PnL as bars.</div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-right">
          <TinyChartStat label="Final" value={formatCurrency(last.cumulativePnl)} tone={pnlTone(last.cumulativePnl)} />
          <TinyChartStat label="Best Trade" value={formatCurrency(bestPoint.pnl)} tone="text-emerald-300" />
          <TinyChartStat label="Worst Trade" value={formatCurrency(worstPoint.pnl)} tone="text-rose-300" />
        </div>
      </div>
      <div className="mt-3 h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ left: 4, right: 12, top: 12, bottom: 0 }}>
            <defs>
              <linearGradient id="tradeHistoryFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
            <XAxis
              dataKey="index"
              tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={18}
            />
            <YAxis
              yAxisId="pnl"
              tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
              tickFormatter={(value) => `$${Number(value).toFixed(0)}`}
              tickLine={false}
              axisLine={false}
              width={58}
            />
            <YAxis
              yAxisId="trade"
              orientation="right"
              tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }}
              tickFormatter={(value) => `$${Number(value).toFixed(0)}`}
              tickLine={false}
              axisLine={false}
              width={50}
            />
            <Tooltip content={<TradeHistoryTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar yAxisId="trade" dataKey="pnl" fill="#64748b" radius={[3, 3, 0, 0]} opacity={0.52} />
            <Area
              yAxisId="pnl"
              type="monotone"
              dataKey="cumulativePnl"
              stroke="#22d3ee"
              strokeWidth={2}
              fill="url(#tradeHistoryFill)"
              dot={{ r: 2, fill: '#22d3ee', strokeWidth: 0 }}
              activeDot={{ r: 4, fill: '#67e8f9', strokeWidth: 0 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TradeHistoryTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: TradeChartPoint }> }) {
  if (!active || !payload?.length || !payload[0].payload) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/95 p-3 text-xs shadow-xl">
      <div className="font-semibold text-white">Trade #{point.index} | {point.symbol} {point.side.toUpperCase()}</div>
      <div className="mt-1 text-white/45">{point.label} | {point.source}</div>
      <div className={`mt-2 font-semibold ${pnlTone(point.pnl)}`}>Trade PnL: {formatCurrency(point.pnl)}</div>
      <div className={`mt-1 font-semibold ${pnlTone(point.cumulativePnl)}`}>Cumulative: {formatCurrency(point.cumulativePnl)}</div>
      <div className="mt-1 text-white/60">Drawdown: {formatCurrency(point.drawdown)}</div>
      {point.returnPct !== null ? <div className="mt-1 text-white/60">Return: {formatOptionalPercent(point.returnPct)}</div> : null}
    </div>
  );
}

function TradeRow({ trade, expanded, onToggle }: { trade: NormalizedTrade; expanded: boolean; onToggle: () => void }) {
  const hasDetails = Boolean(trade.thesis || trade.triggerPlan || trade.invalidationPlan || trade.reasons.length || Object.keys(trade.filtersPassed).length || Object.keys(trade.filtersFailed).length);
  return (
    <>
      <tr className="border-b border-white/10 bg-black/10 align-top hover:bg-white/[0.03]">
        <td className="px-3 py-3 text-white/70">
          <button type="button" onClick={onToggle} className="text-left hover:text-cyan-100" disabled={!hasDetails}>
            <span className="block text-white/80">{formatTradeTime(trade.entryTime)}</span>
            <span className="text-xs text-white/35">{trade.source} | {trade.status}</span>
          </button>
        </td>
        <td className="px-3 py-3 font-semibold text-white">{trade.symbol}</td>
        <td className="px-3 py-3 uppercase text-white/60">{trade.side}</td>
        <td className="px-3 py-3 text-white/70">{formatPrice(trade.entryPrice)}</td>
        <td className="px-3 py-3 text-white/70">{formatPrice(trade.exitPrice)}</td>
        <td className="px-3 py-3 text-right text-white/70">{formatOptionalCurrency(trade.sizeUsd)}</td>
        <td className={`px-3 py-3 text-right font-semibold ${pnlTone(trade.netPnl)}`}>{formatOptionalCurrency(trade.netPnl)}</td>
        <td className={`px-3 py-3 text-right font-semibold ${pnlTone(trade.returnPct)}`}>{formatOptionalPercent(trade.returnPct)}</td>
        <td className="px-3 py-3 text-white/60">{trade.exitReason ?? 'N/D'}</td>
      </tr>
      {expanded ? (
        <tr className="border-b border-white/10 bg-cyan-500/[0.04]">
          <td colSpan={9} className="px-3 py-3">
            <TradeDetails trade={trade} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function TradeDetails({ trade }: { trade: NormalizedTrade }) {
  return (
    <div className="grid gap-3 rounded-lg border border-cyan-400/15 bg-black/25 p-3 text-sm">
      <div className="grid gap-2 md:grid-cols-3">
        <DetailBlock label="Thesis" value={trade.thesis} />
        <DetailBlock label="Trigger" value={trade.triggerPlan} />
        <DetailBlock label="Invalidation" value={trade.invalidationPlan} />
      </div>
      {trade.reasons.length > 0 ? (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Reasons</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {trade.reasons.map((reason, index) => (
              <span key={`${reason}-${index}`} className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-white/65">{reason}</span>
            ))}
          </div>
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        <FilterMap title="Filters Passed" items={trade.filtersPassed} tone="text-emerald-200" />
        <FilterMap title="Filters Failed" items={trade.filtersFailed} tone="text-rose-200" />
      </div>
    </div>
  );
}

function formatArtifactDate(value: number | null | undefined): string {
  if (!value) return 'N/D';
  return new Date(value).toLocaleString();
}

function formatArtifactPercent(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'N/D';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? formatPercent(numeric) : 'N/D';
}

function formatArtifactNumber(value: unknown, digits = 2): string {
  if (value === null || value === undefined || value === '') return 'N/D';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : 'N/D';
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatOptionalCurrency(value: number | null): string {
  return value === null ? 'N/D' : formatCurrency(value);
}

function formatOptionalPercent(value: number | null): string {
  return value === null ? 'N/D' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatPrice(value: number | null): string {
  if (value === null) return 'N/D';
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: value >= 100 ? 2 : 6 })}`;
}

function formatTradeTime(value: string | number | null): string {
  if (value === null || value === undefined || value === '') return 'N/D';
  const timestamp = parseTradeTime(value);
  if (!timestamp) return String(value);
  return new Date(timestamp).toLocaleString();
}

function parseTradeTime(value: string | number | null): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value > 10_000_000_000 ? value : value * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pnlTone(value: number | null): string {
  if ((value ?? 0) > 0) return 'text-emerald-300';
  if ((value ?? 0) < 0) return 'text-rose-300';
  return 'text-white';
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-black/25 p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">{title}</div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function DetailBlock({ label, value, detail }: { label: string; value: string | null; detail?: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">{label}</div>
      <div className="mt-2 text-sm text-white/65">{value || 'N/D'}</div>
      {detail ? <div className="mt-1 text-xs text-white/40">{detail}</div> : null}
    </div>
  );
}

function FilterMap({ title, items, tone }: { title: string; items: Record<string, string>; tone: string }) {
  const entries = Object.entries(items);
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">{title}</div>
      <div className="mt-2 grid gap-1">
        {entries.length === 0 ? <div className="text-xs text-white/40">N/D</div> : entries.map(([key, value]) => (
          <div key={key} className="text-xs text-white/60">
            <span className={`font-semibold ${tone}`}>{key.replace(/_/g, ' ')}</span>: {value}
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniMetric({ label, value, detail, tone = 'text-white' }: { label: string; value: string; detail: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">{label}</div>
      <div className={`mt-1 truncate text-sm font-semibold ${tone}`}>{value}</div>
      <div className="mt-1 truncate text-xs text-white/40">{detail}</div>
    </div>
  );
}

function TinyChartStat({ label, value, tone = 'text-white' }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">{label}</div>
      <div className={`mt-1 text-xs font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
