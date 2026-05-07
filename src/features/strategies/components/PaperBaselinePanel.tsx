import type { ReactNode } from 'react';
import type {
  HyperliquidPaperReadinessResponse,
  HyperliquidPaperRuntimeSupervisorResponse
} from '@/services/hyperliquidService';

export function PaperBaselinePanel({
  paper,
  paperPath,
  readiness,
  readinessError,
  supervisor,
  supervisorError
}: {
  paper: Record<string, unknown> | null;
  paperPath: string | null;
  readiness: HyperliquidPaperReadinessResponse | null;
  readinessError: string | null;
  supervisor: HyperliquidPaperRuntimeSupervisorResponse | null;
  supervisorError: string | null;
}) {
  const baseline = nestedRecord(paper, 'paper_baseline');
  const projection = nestedRecord(baseline, 'projection');
  const benchmark = nestedRecord(baseline, 'backtestBenchmark');
  const sample = nestedRecord(baseline, 'minimumPaperSample');
  const driftChecks = recordListAt(baseline, 'driftChecks');
  const blockers = stringListAt(baseline, 'promotionBlockers');
  const killSwitches = stringListAt(baseline, 'killSwitches');
  const readinessTone = readiness?.readiness.status === 'paper-ready-for-human-review' ? 'text-emerald-300' : readiness?.readiness.status === 'paper-blocked' ? 'text-amber-200' : 'text-white/65';
  const healthStatus = supervisor?.healthStatus ?? 'N/D';
  const healthTone = healthStatus === 'healthy' ? 'text-emerald-300' : healthStatus === 'degraded' ? 'text-amber-200' : healthStatus === 'N/D' ? 'text-white/65' : 'text-rose-300';
  const supervisorTone = supervisor?.running ? 'text-emerald-300' : supervisor ? 'text-amber-200' : 'text-white/65';
  const lastTick = recordOrNull(supervisor?.lastTick ?? null);
  const lastTickLabel = [
    numberAt(lastTick, 'tick') ? `tick ${numberAt(lastTick, 'tick')}` : null,
    stringAt(lastTick, 'status'),
    stringAt(lastTick, 'signal') ? `signal ${stringAt(lastTick, 'signal')}` : null
  ].filter(Boolean).join(' | ') || 'no tick yet';
  const healthDetail = supervisor?.healthBlockers.length
    ? supervisor.healthBlockers.slice(0, 2).join(', ')
    : supervisor?.lastLogAgeSeconds !== null && supervisor?.lastLogAgeSeconds !== undefined
      ? `last log ${formatArtifactNumber(supervisor.lastLogAgeSeconds, 0)}s ago`
      : supervisorError ?? 'runtime health';

  return (
    <Panel title="Paper Baseline">
      {baseline ? (
        <div className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-4">
            <MiniMetric label="Status" value={stringAt(baseline, 'status') ?? 'N/D'} detail={stringAt(baseline, 'candidateStatus') ?? 'paper candidate'} />
            <MiniMetric label="2x ETA" value={formatArtifactNumber(numberAt(projection, 'projectedDaysToDouble'), 1)} detail="research projection days" tone="text-emerald-300" />
            <MiniMetric label="Paper Sample" value={`${numberAt(sample, 'closedTrades') ?? 'N/D'} trades`} detail={`${numberAt(sample, 'calendarDays') ?? 'N/D'} calendar days`} />
            <MiniMetric label="Review" value={`${numberAt(sample, 'reviewCoveragePct') ?? 'N/D'}%`} detail="minimum coverage" />
          </div>
          <div className="rounded-md border border-white/10 bg-black/20 p-3">
            <div className="grid gap-3 md:grid-cols-4">
              <MiniMetric label="Readiness" value={readiness?.readiness.status ?? 'N/D'} detail={readiness?.readiness.nextAction ?? readinessError ?? 'gateway readiness'} tone={readinessTone} />
              <MiniMetric label="Closed Paper" value={String(readiness?.readiness.sampleProgress.closedTrades ?? 0)} detail={`${readiness?.readiness.sampleProgress.requiredClosedTrades ?? numberAt(sample, 'closedTrades') ?? 'N/D'} required`} />
              <MiniMetric label="Paper Net" value={formatArtifactPercent(readiness?.readiness.paperMetrics.paperNetReturnPct)} detail={`${formatCurrency(readiness?.readiness.paperMetrics.netPnlAfterFeesUsd ?? 0)} after est. fees`} tone={(readiness?.readiness.paperMetrics.netPnlAfterFeesUsd ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'} />
              <MiniMetric label="Reviews" value={formatArtifactPercent(readiness?.readiness.sampleProgress.reviewCoveragePct)} detail={`${readiness?.readiness.sampleProgress.reviewedTrades ?? 0} reviewed`} />
            </div>
            {readiness ? (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <PathList
                  title="Readiness Checks"
                  paths={readiness.readiness.driftChecks.map((check) => `${check.passed ? 'pass' : 'fail'} ${check.key ?? check.metric}: ${formatArtifactNumber(check.value, 4)} ${check.operator ?? ''} ${formatArtifactNumber(check.threshold, 4)}`)}
                />
                <PathList title="Current Blockers" paths={readiness.readiness.blockers} />
              </div>
            ) : readinessError ? (
              <div className="mt-3 rounded-md border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-100">{readinessError}</div>
            ) : null}
          </div>
          <div className="rounded-md border border-white/10 bg-black/20 p-3">
            <div className="grid gap-3 md:grid-cols-5">
              <MiniMetric label="Health" value={healthStatus} detail={healthDetail} tone={healthTone} />
              <MiniMetric label="Runtime" value={supervisor ? (supervisor.running ? 'running' : 'stopped') : 'N/D'} detail={supervisor?.mode ?? supervisorError ?? 'supervisor'} tone={supervisorTone} />
              <MiniMetric label="Cadence" value={supervisor?.intervalSeconds ? `${formatArtifactNumber(supervisor.intervalSeconds, 0)}s` : 'N/D'} detail={supervisor?.dryRun === false ? 'paper writes enabled' : supervisor?.dryRun === true ? 'dry-run' : 'runtime mode'} />
              <MiniMetric label="Started" value={supervisor?.startedAt ? formatTradeTime(supervisor.startedAt) : 'N/D'} detail={supervisor?.screenSession ?? 'screen session'} />
              <MiniMetric label="Last Tick" value={lastTickLabel} detail={stringAt(lastTick, 'entryBlockReason') ?? (supervisor?.logExists ? 'log available' : 'no log')} />
            </div>
            {supervisor ? (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <DetailBlock label="Supervisor" value={`${supervisor.screenSession} ${supervisor.pid ? `pid ${supervisor.pid}` : 'no pid'} | ${supervisor.gatewayUrl ?? 'gateway N/D'}`} />
                <DetailBlock label="Log" value={`${supervisor.logPath} | stale after ${formatArtifactNumber(supervisor.staleAfterSeconds, 0)}s`} />
              </div>
            ) : supervisorError ? (
              <div className="mt-3 rounded-md border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-100">{supervisorError}</div>
            ) : null}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <DetailBlock
              label="Backtest Benchmark"
              value={[
                `return ${formatArtifactPercent(numberAt(benchmark, 'returnPct'))}`,
                `PF ${formatArtifactNumber(numberAt(benchmark, 'profitFactor'))}`,
                `trades ${numberAt(benchmark, 'totalTrades') ?? 'N/D'}`,
                `fee ${stringAt(benchmark, 'feeModel') ?? 'N/D'}`
              ].join(' | ')}
            />
            <DetailBlock
              label="Projection Use"
              value={stringAt(projection, 'use') ?? 'paper-drift-baseline-only'}
            />
            <PathList
              title="Drift Checks"
              paths={driftChecks.map((check) => `${stringAt(check, 'key') ?? 'check'} ${stringAt(check, 'operator') ?? ''} ${formatArtifactNumber(numberAt(check, 'threshold'), 4)} (${stringAt(check, 'metric') ?? 'metric'})`)}
            />
            <PathList title="Promotion Blockers" paths={blockers} />
          </div>
          <PathList title="Kill Switches" paths={killSwitches} />
          {paperPath ? <div className="break-all text-xs text-white/35">{paperPath}</div> : null}
        </div>
      ) : (
        <div className="grid gap-2 text-sm text-white/55">
          <div>No paper baseline artifact loaded yet. Build or refresh the paper candidate after validation.</div>
          {paperPath ? <div className="break-all text-xs text-white/35">{paperPath}</div> : null}
        </div>
      )}
    </Panel>
  );
}

function formatArtifactPercent(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'N/D';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric >= 0 ? '+' : ''}${numeric.toFixed(2)}%` : 'N/D';
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

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function nestedRecord(record: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  return recordOrNull(record?.[key]);
}

function stringAt(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function numberAt(record: Record<string, unknown> | null, key: string): number | null {
  const value = record?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringListAt(record: Record<string, unknown> | null, key: string): string[] {
  const value = record?.[key];
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function recordListAt(record: Record<string, unknown> | null, key: string): Array<Record<string, unknown>> {
  const value = record?.[key];
  return Array.isArray(value) ? value.map(recordOrNull).filter((item): item is Record<string, unknown> => item !== null) : [];
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

function PathList({ title, paths }: { title: string; paths: string[] }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">{title}</div>
      <div className="mt-2 grid gap-1">
        {paths.length === 0 ? <div className="text-sm text-white/45">N/D</div> : paths.map((path) => (
          <div key={path} className="break-all text-xs text-white/60">{path}</div>
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
