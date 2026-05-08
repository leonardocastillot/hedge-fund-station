import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  hyperliquidService,
  type HyperliquidLatestAgentRunResponse,
  type HyperliquidStrategyAuditResponse,
  type HyperliquidStrategyAuditRow
} from '@/services/hyperliquidService';

type StageFilter = 'all' | HyperliquidStrategyAuditRow['pipelineStage'];

const EMPTY_SUMMARY: HyperliquidStrategyAuditResponse['summary'] = {
  strategyCount: 0,
  tradeCount: 0,
  backtestTrades: 0,
  paperSignals: 0,
  paperTrades: 0,
  polymarketTrades: 0,
  runtimeSetups: 0,
  openTrades: 0,
  closedTrades: 0,
  reviewableClosedTrades: 0,
  reviewedTrades: 0,
  reviewCoverage: 0,
  totalPnlUsd: 0,
  openRiskUsd: 0
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(value);
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function formatTime(value: number | null): string {
  if (!value) return 'N/D';
  return new Date(value).toLocaleString();
}

function pnlTone(value: number): string {
  if (value > 0) return 'text-emerald-300';
  if (value < 0) return 'text-rose-300';
  return 'text-white';
}

function stageTone(stage: HyperliquidStrategyAuditRow['pipelineStage']): string {
  if (stage === 'paper') return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100';
  if (stage === 'audit') return 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100';
  if (stage === 'backtesting') return 'border-blue-400/30 bg-blue-500/10 text-blue-100';
  if (stage === 'blocked') return 'border-amber-400/30 bg-amber-500/10 text-amber-100';
  return 'border-white/10 bg-white/[0.04] text-white/65';
}

function stageLabel(stage: HyperliquidStrategyAuditRow['pipelineStage']): string {
  return stage.replace(/_/g, ' ');
}

function isRuntimeStrategy(strategy: HyperliquidStrategyAuditRow): boolean {
  return strategy.strategyId.startsWith('runtime:') || strategy.strategyKey.startsWith('runtime:');
}

export default function StrategyAuditPage() {
  const [audit, setAudit] = useState<HyperliquidStrategyAuditResponse | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<StageFilter>('audit');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestAgentRun, setLatestAgentRun] = useState<HyperliquidLatestAgentRunResponse | null>(null);
  const [agentRunLoading, setAgentRunLoading] = useState(false);
  const [agentRunMessage, setAgentRunMessage] = useState<string | null>(null);

  const strategies = audit?.strategies ?? [];
  const realStrategies = useMemo(() => strategies.filter((strategy) => !isRuntimeStrategy(strategy)), [strategies]);
  const summary = audit?.summary ?? EMPTY_SUMMARY;

  const loadAudit = async (showLoader = true) => {
    if (showLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      setError(null);
      const response = await hyperliquidService.getStrategyAudit(500);
      const realRows = response.strategies.filter((strategy) => !isRuntimeStrategy(strategy));
      setAudit(response);
      setSelectedKey((current) => {
        if (current && realRows.some((strategy) => strategy.strategyKey === current)) {
          return current;
        }
        return realRows.find((strategy) => strategy.pipelineStage === 'audit')?.strategyKey ?? realRows[0]?.strategyKey ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la auditoria de estrategias.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadAudit(true);
  }, []);

  const filteredStrategies = useMemo(() => {
    if (filter === 'all') return realStrategies;
    return realStrategies.filter((strategy) => strategy.pipelineStage === filter);
  }, [filter, realStrategies]);

  const selectedStrategy = useMemo(() => {
    return realStrategies.find((strategy) => strategy.strategyKey === selectedKey) ?? filteredStrategies[0] ?? realStrategies[0] ?? null;
  }, [filteredStrategies, selectedKey, realStrategies]);

  useEffect(() => {
    if (!selectedStrategy?.strategyId || selectedStrategy.strategyId.startsWith('runtime:')) {
      setLatestAgentRun(null);
      return;
    }
    let cancelled = false;
    setAgentRunMessage(null);
    hyperliquidService.getLatestAgentRun(selectedStrategy.strategyId)
      .then((response) => {
        if (!cancelled) setLatestAgentRun(response);
      })
      .catch(() => {
        if (!cancelled) setLatestAgentRun(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedStrategy?.strategyId]);

  const runResearchOs = async (mode: 'research' | 'audit') => {
    if (!selectedStrategy?.strategyId) return;
    setAgentRunLoading(true);
    setAgentRunMessage(null);
    try {
      const response = mode === 'audit'
        ? await hyperliquidService.runAgentAudit({ strategy_id: selectedStrategy.strategyId, runtime: 'auto' })
        : await hyperliquidService.runAgentResearch({ strategy_id: selectedStrategy.strategyId, runtime: 'auto' });
      const latest = await hyperliquidService.getLatestAgentRun(response.strategyId);
      setLatestAgentRun(latest);
      setAgentRunMessage(`${mode} listo: ${response.recommendation}, ${response.blockerCount} blockers.`);
    } catch (err) {
      setAgentRunMessage(err instanceof Error ? err.message : 'No se pudo ejecutar Research OS.');
    } finally {
      setAgentRunLoading(false);
    }
  };

  const filters = useMemo(() => {
    const stages = Array.from(new Set(realStrategies.map((strategy) => strategy.pipelineStage)));
    return ['all', ...stages] as StageFilter[];
  }, [realStrategies]);

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-7xl items-center justify-center px-4 py-8">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6">
      <section className="border-b border-white/10 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300/80">Strategy Audit Focus</div>
            <h1 className="mt-1 text-2xl font-semibold text-white">Auditoria solo para estrategias que pasaron backtesting robusto.</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Esta vista parte filtrada en Audit. Para ver todo el embudo usa Strategy Pipeline; aca se revisan blockers, gaps y comandos despues del robust gate.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void loadAudit(false)}
              className="rounded-md border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.09]"
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <Link to="/paper" className="rounded-md border border-emerald-400/30 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-500/25">
              Paper Lab
            </Link>
          </div>
        </div>

        {error ? <div className="mt-4 rounded-md border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</div> : null}
        {audit?.runtimeError ? <div className="mt-4 rounded-md border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-100">Runtime gateway evidence partial: {audit.runtimeError}</div> : null}
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Strategies" value={String(realStrategies.length)} detail={`${summary.runtimeSetups} runtime setups excluded`} />
        <Metric label="Evidence Trades" value={formatCompact(summary.tradeCount)} detail={`${summary.backtestTrades} backtest | ${summary.paperTrades} paper`} />
        <Metric label="Total PnL" value={formatCurrency(summary.totalPnlUsd)} detail="artifact + runtime evidence" tone={pnlTone(summary.totalPnlUsd)} />
        <Metric label="DB" value={audit?.database.journalMode?.toUpperCase() ?? 'N/D'} detail={audit?.database.path ?? 'No DB path'} tone="text-cyan-300" />
      </section>

      <section className="rounded-md border border-white/10 bg-black/25 p-4">
        <div className="flex flex-wrap gap-2">
          {filters.map((item) => (
            <button
              key={item}
              onClick={() => setFilter(item)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                filter === item ? 'bg-emerald-400 text-slate-950' : 'border border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.08]'
              }`}
            >
              {item === 'all' ? 'all' : stageLabel(item)}
            </button>
          ))}
        </div>
      </section>

      <section className="grid min-h-0 gap-4 xl:grid-cols-[390px_minmax(0,1fr)]">
        <StrategyList
          strategies={filteredStrategies}
          selectedKey={selectedStrategy?.strategyKey ?? null}
          onSelect={setSelectedKey}
        />

        {selectedStrategy ? (
          <div className="grid gap-4">
            <StrategyEvidencePanel strategy={selectedStrategy} database={audit?.database ?? null} />
              <AgenticResearchPanel
                latest={latestAgentRun}
                loading={agentRunLoading}
                message={agentRunMessage}
                canRunAudit={selectedStrategy.gateStatus === 'audit-eligible'}
                onRunResearch={() => void runResearchOs('research')}
                onRunAudit={() => void runResearchOs('audit')}
              />
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-white/10 bg-white/[0.03] p-8 text-center text-white/55">
            No hay estrategias para este filtro.
          </div>
        )}
      </section>
    </div>
  );
}

function StrategyList({
  strategies,
  selectedKey,
  onSelect
}: {
  strategies: HyperliquidStrategyAuditRow[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="min-h-0 overflow-hidden rounded-md border border-white/10 bg-black/25">
      <div className="border-b border-white/10 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">Strategy Ledger</div>
      <div className="max-h-[690px] overflow-y-auto">
        {strategies.length === 0 ? (
          <div className="p-5 text-sm text-white/55">No hay estrategias en este filtro.</div>
        ) : (
          strategies.map((strategy) => (
            <button
              key={strategy.strategyKey}
              onClick={() => onSelect(strategy.strategyKey)}
              className={`grid w-full gap-2 border-b border-white/10 px-4 py-3 text-left transition ${
                selectedKey === strategy.strategyKey ? 'bg-emerald-500/10' : 'hover:bg-white/[0.04]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{strategy.displayName}</div>
                  <div className="mt-1 truncate text-[10px] uppercase tracking-[0.16em] text-white/40">
                    {strategy.symbol ?? strategy.strategyId} | {strategy.sourceTypes.join(', ') || 'no source'}
                  </div>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${stageTone(strategy.pipelineStage)}`}>
                  {stageLabel(strategy.pipelineStage)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs text-white/55">
                <span>{strategy.tradeCount} trades</span>
                <span>{strategy.evidenceCounts.backtestTrades} BT</span>
                <span>{strategy.evidenceCounts.paperTrades} paper</span>
              </div>
              {strategy.gateReasons.length > 0 ? (
                <div className="truncate text-xs text-amber-200/75">Gate: {strategy.gateReasons.slice(0, 3).join(', ')}</div>
              ) : strategy.missingAuditItems.length > 0 ? (
                <div className="truncate text-xs text-amber-200/75">Missing: {strategy.missingAuditItems.slice(0, 3).join(', ')}</div>
              ) : (
                <div className="text-xs text-emerald-200/75">Audit checklist clean</div>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function StrategyEvidencePanel({
  strategy,
  database
}: {
  strategy: HyperliquidStrategyAuditRow;
  database: HyperliquidStrategyAuditResponse['database'] | null;
}) {
  return (
    <div className="grid gap-4">
      <section className="rounded-md border border-white/10 bg-black/25 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">Selected Strategy</div>
            <h2 className="mt-1 text-xl font-semibold text-white">{strategy.displayName}</h2>
            <div className="mt-1 text-sm text-white/55">
              {strategy.strategyId} | {strategy.pipelineStage} | {strategy.gateStatus} | last: {formatTime(strategy.lastActivityAt)} {strategy.lastActivityLabel ? `| ${strategy.lastActivityLabel}` : ''}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-right md:grid-cols-4">
            <TinyStat label="Trades" value={String(strategy.tradeCount)} />
            <TinyStat label="Win Rate" value={`${strategy.winRate.toFixed(0)}%`} />
            <TinyStat label="Review" value={`${strategy.reviewCoverage.toFixed(0)}%`} />
            <TinyStat label="PnL" value={formatCurrency(strategy.totalPnlUsd)} tone={pnlTone(strategy.totalPnlUsd)} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <EvidenceCounts strategy={strategy} />
        <AuditChecklist strategy={strategy} database={database} />
      </section>

      <section className="rounded-md border border-white/10 bg-black/25">
        <div className="border-b border-white/10 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">Evidence Timeline</div>
        <div className="grid gap-2 p-3">
          {strategy.timeline.length === 0 ? (
            <div className="p-3 text-sm text-white/55">Esta estrategia existe, pero todavia no tiene artefactos ni trades vinculados.</div>
          ) : (
            strategy.timeline.map((item) => <TimelineItem key={item.id} item={item} />)
          )}
        </div>
      </section>

      <section className="rounded-md border border-white/10 bg-black/25 p-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">Artifact Paths</div>
        <div className="mt-3 grid gap-2 text-xs text-white/60 md:grid-cols-2">
          {Object.entries(strategy.latestArtifactPaths).map(([key, value]) => (
            <div key={key} className="rounded-md border border-white/10 bg-white/[0.03] p-2">
              <span className="font-semibold uppercase tracking-[0.12em] text-white/35">{key}</span>
              <div className="mt-1 break-all">{value ?? 'missing'}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function AgenticResearchPanel({
  latest,
  loading,
  message,
  canRunAudit,
  onRunResearch,
  onRunAudit
}: {
  latest: HyperliquidLatestAgentRunResponse | null;
  loading: boolean;
  message: string | null;
  canRunAudit: boolean;
  onRunResearch: () => void;
  onRunAudit: () => void;
}) {
  const decision = latest?.agentRun.decision;
  return (
    <section className="rounded-md border border-cyan-400/20 bg-cyan-500/[0.06] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-200/75">Agentic Research OS</div>
          <h3 className="mt-1 text-lg font-semibold text-white">
            {decision ? `${decision.recommendation} | confidence ${decision.confidence}` : 'Sin decision agentica aun'}
          </h3>
          <p className="mt-1 text-sm text-slate-300">
            {decision?.executive_summary ?? 'Ejecuta research o audit para generar debate, blockers, gaps y comandos hf:* auditables.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRunResearch}
            disabled={loading}
            className="rounded-md border border-cyan-300/30 bg-cyan-400/15 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-cyan-50 transition hover:bg-cyan-400/25 disabled:opacity-55"
          >
            {loading ? 'Running...' : 'Run Research OS'}
          </button>
          <button
            type="button"
            onClick={onRunAudit}
            disabled={loading || !canRunAudit}
            className="rounded-md border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-white/80 transition hover:bg-white/[0.09] disabled:opacity-55"
          >
            {canRunAudit ? 'Audit' : 'Audit Locked'}
          </button>
        </div>
      </div>
      {message ? <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-2 text-sm text-white/75">{message}</div> : null}
      {latest ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-white/10 bg-black/20 p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Runtime</div>
            <div className="mt-1 text-sm text-white/75">{latest.agentRun.ai?.runtime_mode ?? 'unknown'} | {latest.agentRun.ai?.provider ?? 'deterministic'}</div>
            <div className="mt-2 break-all text-xs text-white/45">{latest.agentRun.run_id}</div>
          </div>
          <div className="rounded-md border border-white/10 bg-black/20 p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Blockers / Gaps</div>
            <div className="mt-1 text-sm text-amber-100">{decision?.blockers.length ?? 0} blockers</div>
            <div className="mt-1 text-xs text-white/55">{decision?.validation_gaps.slice(0, 2).map((gap) => gap.key).join(', ') || 'No gaps reported'}</div>
          </div>
          <div className="md:col-span-2 rounded-md border border-white/10 bg-black/20 p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Recommended hf:* commands</div>
            <div className="mt-2 grid gap-2">
              {(decision?.recommended_commands ?? []).map((command) => (
                <code key={command} className="break-all rounded bg-white/[0.05] px-2 py-1 text-xs text-cyan-100">{command}</code>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function EvidenceCounts({ strategy }: { strategy: HyperliquidStrategyAuditRow }) {
  const items = [
    ['Backtest trades', strategy.evidenceCounts.backtestTrades],
    ['Paper candidates', strategy.evidenceCounts.paperCandidates],
    ['Paper signals', strategy.evidenceCounts.paperSignals],
    ['Paper trades', strategy.evidenceCounts.paperTrades],
    ['Polymarket trades', strategy.evidenceCounts.polymarketTrades],
    ['Runtime setups', strategy.evidenceCounts.runtimeSetups]
  ] as const;
  return (
    <div className="rounded-md border border-white/10 bg-black/25 p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">Evidence Counts</div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-md border border-white/10 bg-white/[0.03] p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">{label}</div>
            <div className="mt-1 text-lg font-semibold text-white">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditChecklist({
  strategy,
  database
}: {
  strategy: HyperliquidStrategyAuditRow;
  database: HyperliquidStrategyAuditResponse['database'] | null;
}) {
  const checks = [
    ['Docs', strategy.checklist.docsExists],
    ['Spec', strategy.checklist.specExists],
    ['Backend', strategy.checklist.backendModuleExists],
    ['Backtest', strategy.checklist.backtestExists],
    ['Validation', strategy.checklist.validationExists],
    ['Paper candidate', strategy.checklist.paperCandidateExists],
    ['Paper ledger', strategy.checklist.paperLedgerExists],
    ['Reviews', strategy.checklist.reviewsComplete]
  ] as const;

  return (
    <div className="rounded-md border border-white/10 bg-black/25 p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">Audit Checklist</div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {checks.map(([label, ok]) => (
          <ChecklistItem key={label} ok={ok} label={label} />
        ))}
      </div>
      <div className="mt-3 rounded-md border border-cyan-400/20 bg-cyan-500/10 p-3 text-xs text-cyan-50/85">
        DB: {database?.recommendation ?? 'unknown'} | {database?.migrationTrigger ?? 'No migration guidance.'}
      </div>
    </div>
  );
}

function TimelineItem({ item }: { item: HyperliquidStrategyAuditRow['timeline'][number] }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">{item.title}</div>
          <div className="mt-1 text-xs text-white/45">{formatTime(item.timestampMs)} | {item.type} | {item.source}</div>
        </div>
        <div className="text-right">
          {typeof item.pnlUsd === 'number' ? <div className={`text-sm font-semibold ${pnlTone(item.pnlUsd)}`}>{formatCurrency(item.pnlUsd)}</div> : null}
          {item.status ? <div className="text-xs uppercase tracking-[0.12em] text-white/40">{item.status}</div> : null}
        </div>
      </div>
      {item.subtitle ? <div className="mt-2 text-sm text-white/60">{item.subtitle}</div> : null}
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-white/45">
        {typeof item.entryPrice === 'number' ? <span>Entry ${item.entryPrice.toLocaleString()}</span> : null}
        {typeof item.exitPrice === 'number' ? <span>Exit ${item.exitPrice.toLocaleString()}</span> : null}
        {typeof item.executionQuality === 'number' ? <span>Q {item.executionQuality}/100</span> : null}
        {item.review ? <span>Review {item.review.outcomeTag} {item.review.executionScore}/10</span> : null}
      </div>
      {item.path ? <div className="mt-2 break-all text-[11px] text-white/35">{item.path}</div> : null}
    </div>
  );
}

function ChecklistItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${ok ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100' : 'border-amber-400/25 bg-amber-500/10 text-amber-100'}`}>
      <div className="text-xs font-semibold">{ok ? 'OK' : 'Missing'} | {label}</div>
    </div>
  );
}

function Metric({ label, value, detail, tone = 'text-white' }: { label: string; value: string; detail: string; tone?: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/35">{label}</div>
      <div className={`mt-2 truncate text-2xl font-semibold ${tone}`}>{value}</div>
      <div className="mt-1 truncate text-sm text-white/50">{detail}</div>
    </div>
  );
}

function TinyStat({ label, value, tone = 'text-white' }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
