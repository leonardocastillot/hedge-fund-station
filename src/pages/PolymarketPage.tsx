import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, AlertCircle, DollarSign, Play, ShieldAlert, TrendingUp, Zap } from 'lucide-react';
import {
  polymarketService,
  type EquityPoint,
  type PolymarketBtc5mRunResult,
  type PolymarketBtc5mStatus,
  type PolymarketBtc5mTrade,
  type PolymarketBtc5mAutoStatus,
  type PolymarketWalletDiagnostics,
  type PolymarketWalletOverview,
} from '../services/polymarketService';

function formatCurrency(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatPct(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

function MetricCard({
  label,
  value,
  hint,
  tone = 'neutral',
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: 'neutral' | 'profit' | 'warn' | 'risk';
  icon: ReactNode;
}) {
  const toneStyles = {
    neutral: 'border-zinc-800 bg-zinc-950/80 text-zinc-100',
    profit: 'border-emerald-900/80 bg-emerald-950/40 text-emerald-100',
    warn: 'border-amber-900/80 bg-amber-950/30 text-amber-100',
    risk: 'border-red-950/80 bg-red-950/30 text-red-100',
  }[tone];

  return (
    <div className={`rounded-2xl border p-5 shadow-[0_18px_60px_-35px_rgba(0,0,0,0.9)] ${toneStyles}`}>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs uppercase tracking-[0.18em] text-zinc-500">{label}</span>
        <div className="text-zinc-400">{icon}</div>
      </div>
      <div className="text-3xl font-semibold">{value}</div>
      <div className="mt-2 text-sm text-zinc-500">{hint}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-black/40 p-5">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export default function PolymarketPage() {
  const [walletOverview, setWalletOverview] = useState<PolymarketWalletOverview | null>(null);
  const [walletDiagnostics, setWalletDiagnostics] = useState<PolymarketWalletDiagnostics | null>(null);
  const [walletDiagnosticsError, setWalletDiagnosticsError] = useState<string | null>(null);
  const [walletEquityCurve, setWalletEquityCurve] = useState<EquityPoint[]>([]);
  const [btc5mStatus, setBtc5mStatus] = useState<PolymarketBtc5mStatus | null>(null);
  const [btc5mTrades, setBtc5mTrades] = useState<PolymarketBtc5mTrade[]>([]);
  const [btc5mEquityCurve, setBtc5mEquityCurve] = useState<EquityPoint[]>([]);
  const [btc5mAutoStatus, setBtc5mAutoStatus] = useState<PolymarketBtc5mAutoStatus | null>(null);
  const [btc5mMode, setBtc5mMode] = useState<'dry-run' | 'live'>('dry-run');
  const [btc5mBalanceUsd, setBtc5mBalanceUsd] = useState<number>(0);
  const [btc5mBasisBps, setBtc5mBasisBps] = useState<number>(12);
  const [btc5mMaxNotionalUsd, setBtc5mMaxNotionalUsd] = useState<number>(1);
  const [btc5mSettlementPrice, setBtc5mSettlementPrice] = useState<number>(1);
  const [lastBtc5mRun, setLastBtc5mRun] = useState<PolymarketBtc5mRunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    const loadData = async () => {
      if (document.hidden || isFetchingRef.current) return;
      isFetchingRef.current = true;

      try {
        setError(null);
        let resolvedWalletBalance = 0;
        try {
          const [walletData, walletCurve, diagnostics] = await Promise.all([
            polymarketService.getWalletOverview(),
            polymarketService.getWalletEquityCurve(),
            polymarketService.getWalletDiagnostics().catch((diagnosticError: any) => diagnosticError),
          ]);
          if (!isMountedRef.current) return;
          setWalletOverview(walletData);
          setWalletEquityCurve(Array.isArray(walletCurve) ? walletCurve : []);
          if (diagnostics instanceof Error) {
            setWalletDiagnostics(null);
            setWalletDiagnosticsError(diagnostics.message || 'No se pudo cargar el diagnostico detallado de wallet.');
          } else {
            setWalletDiagnostics(diagnostics);
            setWalletDiagnosticsError(null);
          }
          resolvedWalletBalance = (walletData?.cashBalance ?? 0) > 0
            ? (walletData?.cashBalance ?? 0)
            : (walletData?.portfolioValue ?? 0);
          setBtc5mBalanceUsd(resolvedWalletBalance);
        } catch (walletError: any) {
          setWalletOverview(null);
          setWalletEquityCurve([]);
          setWalletDiagnostics(null);
          setWalletDiagnosticsError(walletError?.message || null);
        }

        try {
          const [btcStatus, btcTradesData, btcCurve, autoStatus] = await Promise.all([
            polymarketService.getBtc5mStatus(resolvedWalletBalance > 0 ? resolvedWalletBalance : null),
            polymarketService.getBtc5mTrades(50),
            polymarketService.getBtc5mEquityCurve(resolvedWalletBalance > 0 ? resolvedWalletBalance : null),
            polymarketService.getBtc5mAutoStatus().catch(() => null),
          ]);
          if (!isMountedRef.current) return;
          setBtc5mStatus(btcStatus);
          setBtc5mTrades(Array.isArray(btcTradesData) ? btcTradesData : []);
          setBtc5mEquityCurve(Array.isArray(btcCurve) ? btcCurve : []);
          setBtc5mAutoStatus(autoStatus);
        } catch {
          setBtc5mStatus(null);
          setBtc5mTrades([]);
          setBtc5mEquityCurve([]);
          setBtc5mAutoStatus(null);
        }

        setStats(null);
        setOpportunities([]);
        setChainlinkUpdates([]);
        setEquityCurve([]);
      } catch (err: any) {
        if (isMountedRef.current) {
          setError(err.message || 'Error cargando Polymarket');
        }
      } finally {
        isFetchingRef.current = false;
      }
    };

    void loadData();
    const interval = window.setInterval(() => void loadData(), 15_000);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!(btc5mStatus?.liveReadiness?.liveEnabled ?? false) && btc5mMode === 'live') {
      setBtc5mMode('dry-run');
    }
  }, [btc5mMode, btc5mStatus]);

  const refreshBtc5mPanel = async () => {
    const [statusData, tradesData, curveData, autoStatus] = await Promise.all([
      polymarketService.getBtc5mStatus(walletOverview?.cashBalance ?? walletOverview?.portfolioValue ?? null),
      polymarketService.getBtc5mTrades(50),
      polymarketService.getBtc5mEquityCurve(walletOverview?.cashBalance ?? walletOverview?.portfolioValue ?? null),
      polymarketService.getBtc5mAutoStatus().catch(() => null),
    ]);
    setBtc5mStatus(statusData);
    setBtc5mTrades(Array.isArray(tradesData) ? tradesData : []);
    setBtc5mEquityCurve(Array.isArray(curveData) ? curveData : []);
    setBtc5mAutoStatus(autoStatus);
  };

  const handleRunBtc5m = async () => {
    setLoading(true);
    setError(null);
    try {
      const activeSlug = btc5mStatus?.latestSnapshot?.slug || btc5mStatus?.marketSlug || 'btc-updown-5m-1773548700';
      const result = await polymarketService.runBtc5mOnce({
        slug: activeSlug,
        mode: btc5mMode,
        basis_bps: null,
        balance_usd: null,
        stake_pct: 100,
        max_notional_usd: btc5mMaxNotionalUsd,
        safety_margin_pct: 0.1,
        max_spread_pct: 1.2,
        min_seconds_to_expiry: 15,
        max_seconds_to_expiry: 250,
        require_full_fill: true,
      });
      setLastBtc5mRun(result);
      await refreshBtc5mPanel();
    } catch (err: any) {
      setError(err.message || 'Error ejecutando BTC 5m');
    } finally {
      setLoading(false);
    }
  };

  const handleStartBtc5mAuto = async () => {
    setLoading(true);
    setError(null);
    try {
      const nextStatus = await polymarketService.startBtc5mAuto({
        mode: btc5mMode,
        balance_usd: null,
        stake_pct: 100,
        max_notional_usd: btc5mMaxNotionalUsd,
        safety_margin_pct: 0.1,
        max_spread_pct: 1.2,
        min_seconds_to_expiry: 15,
        max_seconds_to_expiry: 250,
        interval_seconds: 5,
        require_full_fill: true,
      });
      setBtc5mAutoStatus(nextStatus);
      await refreshBtc5mPanel();
    } catch (err: any) {
      setError(err.message || 'Error iniciando auto BTC 5m');
    } finally {
      setLoading(false);
    }
  };

  const handleStopBtc5mAuto = async () => {
    setLoading(true);
    setError(null);
    try {
      const nextStatus = await polymarketService.stopBtc5mAuto();
      setBtc5mAutoStatus(nextStatus);
      await refreshBtc5mPanel();
    } catch (err: any) {
      setError(err.message || 'Error deteniendo auto BTC 5m');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseBtc5mTrade = async (tradeId: number) => {
    setLoading(true);
    setError(null);
    try {
      const trade = btc5mTrades.find((item) => item.id === tradeId);
      await polymarketService.closeBtc5mTrade(tradeId, trade?.mode === 'live' ? null : btc5mSettlementPrice);
      await refreshBtc5mPanel();
    } catch (err: any) {
      setError(err.message || 'Error cerrando trade');
    } finally {
      setLoading(false);
    }
  };

  const liveReady = btc5mStatus?.liveReadiness?.liveEnabled ?? false;
  const liveBlockers = btc5mStatus?.liveReadiness?.blockers ?? [];
  const readinessChecks = useMemo(() => {
    const checks = btc5mStatus?.liveReadiness?.checks;
    if (!checks) return [];
    return [
      ['CLOB client', checks.clobClientInstalled],
      ['Live flag', checks.liveFlagConfigured],
      ['Private key', checks.privateKeyConfigured],
      ['API creds', checks.apiCredsReady],
      ['Funder address', checks.funderAddressConfigured],
      ['Signature type', checks.signatureTypeConfigured],
    ] as Array<[string, boolean]>;
  }, [btc5mStatus]);

  const activeBtc5mSlug = btc5mStatus?.latestSnapshot?.slug || btc5mStatus?.marketSlug || 'N/A';
  const strategyAssessment = btc5mStatus?.strategyAssessment ?? lastBtc5mRun?.strategyAssessment ?? null;
  const walletAddress = walletDiagnostics?.address || walletOverview?.address || 'N/A';
  const walletConnectedState = walletDiagnostics
    ? (walletDiagnostics.connected ? 'connected' : 'disconnected')
    : walletOverview?.address
      ? 'unknown'
      : 'disconnected';
  const walletCashHint = walletOverview?.cashBalanceSource === 'clob'
    ? 'CLOB collateral'
    : walletOverview?.cashBalanceSource === 'data-api'
      ? 'Data API'
      : 'Sin fondos detectados';

  const walletChartData = walletEquityCurve.map((point) => ({
    ...point,
    label: new Date(point.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  }));

  const btc5mChartData = btc5mEquityCurve.map((point) => ({
    ...point,
    label: new Date(point.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  }));

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(64,64,64,0.18),_transparent_40%),linear-gradient(180deg,#090909_0%,#050505_55%,#0f0f10_100%)] px-6 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/80 px-3 py-1 text-xs uppercase tracking-[0.2em] text-zinc-500">
              <ShieldAlert className="h-3.5 w-3.5" />
              BTC 5m review
            </div>
            <h1 className="mt-3 text-4xl font-semibold text-zinc-50">Polymarket BTC 5m</h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-400">
              La vista quedó enfocada en tres cosas: wallet real, readiness de live y journal del backend. `Dry-run` funciona hoy. `Live` sigue bloqueado hasta integrar CLOB real.
            </p>
            <p className="mt-2 max-w-3xl text-sm text-cyan-300/80">
              El backend ya puede enviar una orden live minima por monto al CLOB si las credenciales y el flag explicito estan configurados.
            </p>
          </div>
          <div className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm ${
            liveReady
              ? 'border-emerald-900/80 bg-emerald-950/40 text-emerald-300'
              : 'border-amber-900/80 bg-amber-950/30 text-amber-300'
          }`}>
            <ShieldAlert className="h-4 w-4" />
            {liveReady ? 'Live Ready' : 'Live Blocked'}
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-950/70 bg-red-950/30 p-4 text-red-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              <span>{error}</span>
            </div>
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Panel title="Wallet Real">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Portfolio" value={formatCurrency(walletOverview?.portfolioValue ?? 0)} hint="Data API real" tone="profit" icon={<DollarSign className="h-5 w-5" />} />
              <MetricCard label="Cash" value={formatCurrency(walletOverview?.cashBalance ?? 0)} hint={walletCashHint} icon={<Activity className="h-5 w-5" />} />
              <MetricCard label="Unrealized" value={formatCurrency(walletOverview?.unrealizedPnlUsd ?? 0)} hint={`${walletOverview?.openPositions.length ?? 0} posiciones`} tone={(walletOverview?.unrealizedPnlUsd ?? 0) >= 0 ? 'profit' : 'risk'} icon={<TrendingUp className="h-5 w-5" />} />
              <MetricCard label="Address" value={walletOverview ? 'Configured' : 'N/A'} hint={walletOverview?.address ?? 'Sin address'} tone={walletOverview ? 'profit' : 'warn'} icon={<ShieldAlert className="h-5 w-5" />} />
            </div>
            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-300">
              <div>
                Conexion wallet:{' '}
                <span className={
                  walletConnectedState === 'connected'
                    ? 'text-emerald-400'
                    : walletConnectedState === 'unknown'
                      ? 'text-amber-300'
                      : 'text-red-400'
                }>
                  {walletConnectedState === 'connected' ? 'OK' : walletConnectedState === 'unknown' ? 'Sin diagnostico' : 'No conectada'}
                </span>
              </div>
              <div className="mt-1">Address usada: <span className="font-mono text-cyan-300">{walletAddress}</span></div>
              <div className="mt-1">Fondos detectados: <span className={walletDiagnostics?.hasFunds ? 'text-emerald-400' : 'text-amber-300'}>{walletDiagnostics?.hasFunds ? 'Si' : 'No'}</span></div>
              <div className="mt-1">Cash efectivo: <span className="text-emerald-300">{formatCurrency(walletDiagnostics?.cashBalance ?? walletOverview?.cashBalance ?? 0)}</span> <span className="text-zinc-500">via {walletDiagnostics?.cashBalanceSource ?? walletOverview?.cashBalanceSource ?? 'none'}</span></div>
              <div className="mt-1">CLOB API: <span className={walletDiagnostics?.clobApiReachable ? 'text-emerald-400' : 'text-amber-300'}>{walletDiagnostics?.clobApiReachable ? 'OK' : 'No'}</span> | Data API: <span className={walletDiagnostics?.dataApiReachable ? 'text-emerald-400' : 'text-amber-300'}>{walletDiagnostics?.dataApiReachable ? 'OK' : 'No'}</span> | API keys: {walletDiagnostics?.apiKeyCount ?? 0}</div>
              <div className="mt-1">Posiciones: {walletDiagnostics?.positionsCount ?? 0} | Actividad: {walletDiagnostics?.activityCount ?? 0}</div>
              {walletDiagnosticsError ? (
                <div className="mt-2 text-amber-200/90">{walletDiagnosticsError}</div>
              ) : null}
              {(walletDiagnostics?.dataApiErrors ?? []).map((item) => (
                <div key={item} className="mt-2 text-zinc-500">{item}</div>
              ))}
              {(walletDiagnostics?.hints ?? []).map((hint) => (
                <div key={hint} className="mt-2 text-amber-200/90">{hint}</div>
              ))}
            </div>
            <div className="mt-5 h-[220px]">
              {walletChartData.length <= 1 ? (
                <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-black/40 text-sm text-zinc-500">
                  Aun no hay suficiente actividad real para curva de wallet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={walletChartData}>
                    <defs>
                      <linearGradient id="walletFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#27272a" strokeDasharray="4 4" />
                    <XAxis dataKey="label" stroke="#71717a" minTickGap={24} />
                    <YAxis stroke="#71717a" tickFormatter={(value) => `$${Number(value).toFixed(0)}`} />
                    <Tooltip />
                    <Area type="monotone" dataKey="balance" stroke="#22c55e" strokeWidth={2.5} fill="url(#walletFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </Panel>

          <Panel title="Live Readiness">
            <div className="grid gap-2">
              {readinessChecks.map(([label, ok]) => (
                <div key={label} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3 text-sm">
                  <span className="text-zinc-300">{label}</span>
                  <span className={ok ? 'text-emerald-400' : 'text-amber-300'}>{ok ? 'OK' : 'Missing'}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-2">
              {liveBlockers.map((blocker) => (
                <div key={blocker} className="rounded-xl border border-amber-900/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-100/80">
                  {blocker}
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-2">
              {(btc5mStatus?.liveReadiness?.warnings ?? []).map((warning) => (
                <div key={warning} className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3 text-sm text-zinc-300">
                  {warning}
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <Panel title="BTC 5m Journal">
          <div className="grid gap-4 lg:grid-cols-5">
            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-zinc-500">Modo</label>
              <select
                value={btc5mMode}
                onChange={(e) => setBtc5mMode(e.target.value as 'dry-run' | 'live')}
                disabled={!liveReady}
                className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-zinc-600 disabled:opacity-50"
              >
                <option value="dry-run">Dry run</option>
                <option value="live">Live</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-zinc-500">Balance USD</label>
              <input type="number" min={1} value={btc5mBalanceUsd} onChange={(e) => setBtc5mBalanceUsd(Number(e.target.value))} className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-zinc-600" />
            </div>
            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-zinc-500">Basis bps</label>
              <input type="number" value={btc5mBasisBps} onChange={(e) => setBtc5mBasisBps(Number(e.target.value))} className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-zinc-600" />
            </div>
            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-zinc-500">Max notional USD</label>
              <input type="number" min={0.1} step={0.1} value={btc5mMaxNotionalUsd} onChange={(e) => setBtc5mMaxNotionalUsd(Number(e.target.value))} className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-zinc-600" />
            </div>
            <button onClick={handleRunBtc5m} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-5 py-3 font-medium text-white transition hover:bg-cyan-500 disabled:opacity-50">
              <Play className="h-4 w-4" />
              {loading ? 'Ejecutando...' : btc5mMode === 'live' ? 'Enviar orden live' : 'Evaluar BTC 5m'}
            </button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="ROI" value={formatPct(btc5mStatus?.performance.roiPct ?? 0)} hint={`PnL ${formatCurrency(btc5mStatus?.performance.totalPnlUsd ?? 0)}`} tone={(btc5mStatus?.performance.totalPnlUsd ?? 0) >= 0 ? 'profit' : 'risk'} icon={<DollarSign className="h-5 w-5" />} />
            <MetricCard label="Balance" value={formatCurrency(btc5mStatus?.performance.currentBalance ?? btc5mBalanceUsd)} hint={`Inicio ${formatCurrency(btc5mStatus?.performance.startingBalance ?? btc5mBalanceUsd)}`} icon={<Activity className="h-5 w-5" />} />
            <MetricCard label="Closed" value={String(btc5mStatus?.performance.closedTrades ?? 0)} hint={`Win rate ${formatPct(btc5mStatus?.performance.winRatePct ?? 0, 1)}`} icon={<TrendingUp className="h-5 w-5" />} />
            <MetricCard label="Open" value={String(btc5mStatus?.performance.openTrades ?? 0)} hint={btc5mStatus?.sessionGuard?.should_pause ? btc5mStatus.sessionGuard.reason : 'Sin kill-switch'} tone={btc5mStatus?.sessionGuard?.should_pause ? 'risk' : 'warn'} icon={<ShieldAlert className="h-5 w-5" />} />
          </div>

          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-300">
            Mercado activo usado por el backend: <span className="font-mono text-cyan-300">{activeBtc5mSlug}</span>
          </div>

          {strategyAssessment ? (
            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-300">
              <div>Estrategia recomendada hoy: <span className="font-mono text-cyan-300">{strategyAssessment.recommendedStrategy}</span></div>
              <div className="mt-1">Dry-run: <span className={strategyAssessment.dryRun.allowed ? 'text-emerald-400' : 'text-amber-300'}>{strategyAssessment.dryRun.allowed ? 'permitido' : `bloqueado (${strategyAssessment.dryRun.reason})`}</span></div>
              <div className="mt-1">Micro-live: <span className={strategyAssessment.livePilot.allowed ? 'text-emerald-400' : 'text-amber-300'}>{strategyAssessment.livePilot.allowed ? 'permitido' : `bloqueado (${strategyAssessment.livePilot.reason})`}</span></div>
              <div className="mt-1">Perfil: entry {strategyAssessment.entryProfile.entryPrice.toFixed(3)} | bucket {strategyAssessment.entryProfile.entryPriceBucket} | net edge {formatPct(strategyAssessment.entryProfile.netEdgePct, 3)} | spread {formatPct(strategyAssessment.entryProfile.spreadPct, 3)}</div>
              <div className="mt-2 text-zinc-500">Live piloto exige confidence {strategyAssessment.livePilot.minConfidence}+ , net edge {formatPct(strategyAssessment.livePilot.minNetEdgePct, 3)} y entry price {'<='} {strategyAssessment.livePilot.maxEntryPrice.toFixed(2)}.</div>
            </div>
          ) : null}

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto_auto]">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-300">
              Auto runner: <span className={btc5mAutoStatus?.running ? 'text-emerald-400' : 'text-zinc-400'}>{btc5mAutoStatus?.running ? 'Activo' : 'Detenido'}</span>
              {' '}| ultimo run: {btc5mAutoStatus?.lastRunAt ? new Date(btc5mAutoStatus.lastRunAt).toLocaleTimeString() : 'N/A'}
              {' '}| ultimo error: {btc5mAutoStatus?.lastError ?? 'ninguno'}
            </div>
            <button onClick={handleStartBtc5mAuto} disabled={loading || Boolean(btc5mAutoStatus?.running)} className="rounded-xl bg-emerald-600 px-5 py-3 font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50">
              Iniciar auto
            </button>
            <button onClick={handleStopBtc5mAuto} disabled={loading || !btc5mAutoStatus?.running} className="rounded-xl bg-zinc-800 px-5 py-3 font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50">
              Detener auto
            </button>
          </div>

          {btc5mStatus?.latestSnapshot && btc5mStatus.latestSnapshot.secondsToExpiry <= 0 ? (
            <div className="mt-4 rounded-2xl border border-rose-900/60 bg-rose-950/25 p-4 text-sm text-rose-100/85">
              El slug configurado para BTC 5m ya expiró. La estrategia puede seguir evaluando, pero no va a abrir entrada mientras el mercado actual tenga `0s to expiry`.
            </div>
          ) : null}

          <div className="mt-5 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <Panel title="Last Evaluation">
              {lastBtc5mRun ? (
                <div className="grid gap-3">
                  <div className={`rounded-xl border px-4 py-3 text-sm ${
                    lastBtc5mRun.allowed.allowed
                      ? 'border-emerald-900/50 bg-emerald-950/20 text-emerald-200'
                      : 'border-amber-900/50 bg-amber-950/20 text-amber-200'
                  }`}>
                    {lastBtc5mRun.allowed.allowed ? 'Entry allowed by backend.' : `Blocked: ${lastBtc5mRun.allowed.reason}`}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Signal</div>
                      <div className="mt-2 text-xl font-semibold text-white">{lastBtc5mRun.signal.signal}</div>
                      <div className="mt-1 text-sm text-zinc-400">{lastBtc5mRun.signal.side ?? 'No side'}</div>
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Net edge</div>
                      <div className={`mt-2 text-xl font-semibold ${lastBtc5mRun.signal.net_edge_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatPct(lastBtc5mRun.signal.net_edge_pct, 3)}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-300">
                    Position size {formatCurrency(lastBtc5mRun.positionSizing.size_usd)} | {lastBtc5mRun.positionSizing.size_pct.toFixed(2)}%
                  </div>
                  {lastBtc5mRun.execution ? (
                    <div className="rounded-xl border border-cyan-900/50 bg-cyan-950/20 p-4 text-sm text-cyan-100/90">
                      Live order {lastBtc5mRun.execution.exchangeStatus} | outcome {lastBtc5mRun.execution.outcome} | spent {formatCurrency(lastBtc5mRun.execution.spentUsd, 2)} | shares {lastBtc5mRun.execution.shares.toFixed(4)}
                    </div>
                  ) : null}
                  <div className="grid gap-2">
                    {lastBtc5mRun.signal.reasons.map((reason) => (
                      <div key={reason} className="text-sm text-zinc-400">{reason}</div>
                    ))}
                  </div>
                  {(lastBtc5mRun.strategyAssessment?.researchNotes ?? []).length ? (
                    <div className="grid gap-2">
                      {lastBtc5mRun.strategyAssessment?.researchNotes.map((note) => (
                        <div key={note} className="text-sm text-zinc-500">{note}</div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-zinc-800 bg-black/30 p-6 text-sm text-zinc-500">
                  Corre una evaluación BTC 5m para ver filtros, sizing y decisión del backend.
                </div>
              )}
            </Panel>

            <Panel title="BTC 5m Curve">
              <div className="h-[260px]">
                {btc5mChartData.length <= 1 ? (
                  <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-black/40 text-sm text-zinc-500">
                    Aun no hay suficientes trades para curva BTC 5m.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={btc5mChartData}>
                      <defs>
                        <linearGradient id="btc5mFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.04} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#27272a" strokeDasharray="4 4" />
                      <XAxis dataKey="label" stroke="#71717a" minTickGap={24} />
                      <YAxis stroke="#71717a" tickFormatter={(value) => `$${Number(value).toFixed(0)}`} />
                      <Tooltip />
                      <Area type="monotone" dataKey="balance" stroke="#06b6d4" strokeWidth={2.5} fill="url(#btc5mFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Panel>
          </div>

          <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
            <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-zinc-500">Settlement price para cerrar</label>
            <input type="number" min={0} max={1} step={0.01} value={btc5mSettlementPrice} onChange={(e) => setBtc5mSettlementPrice(Number(e.target.value))} className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-zinc-600" />
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-[0.18em] text-zinc-500">
                  <th className="px-4 py-3">Hora</th>
                  <th className="px-4 py-3">Modo</th>
                  <th className="px-4 py-3">Outcome</th>
                  <th className="px-4 py-3">Side</th>
                  <th className="px-4 py-3">Exchange</th>
                  <th className="px-4 py-3 text-right">Entrada</th>
                  <th className="px-4 py-3 text-right">Salida</th>
                  <th className="px-4 py-3 text-right">Size</th>
                  <th className="px-4 py-3 text-right">PnL</th>
                  <th className="px-4 py-3">Accion</th>
                </tr>
              </thead>
              <tbody>
                {btc5mTrades.map((trade) => (
                  <tr key={trade.id} className="border-b border-zinc-900/80 text-sm text-zinc-300">
                    <td className="px-4 py-4">{new Date(trade.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-4">{trade.mode}</td>
                    <td className="px-4 py-4">{trade.outcome ?? 'N/A'}</td>
                    <td className="px-4 py-4">{trade.side}</td>
                    <td className="px-4 py-4">{trade.exchangeStatus ?? (trade.mode === 'live' ? 'submitted' : 'paper')}</td>
                    <td className="px-4 py-4 text-right">{trade.entryPrice?.toFixed(3) ?? 'N/A'}</td>
                    <td className="px-4 py-4 text-right">{trade.exitPrice?.toFixed(3) ?? 'N/A'}</td>
                    <td className="px-4 py-4 text-right">{formatCurrency(trade.sizeUsd, 2)}</td>
                    <td className={`px-4 py-4 text-right ${(trade.netPnlUsd ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {trade.netPnlUsd === null ? 'Abierto' : formatCurrency(trade.netPnlUsd, 2)}
                    </td>
                    <td className="px-4 py-4">
                      {trade.status === 'OPEN' ? (
                        <button onClick={() => void handleCloseBtc5mTrade(trade.id)} className="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-medium text-black transition hover:bg-white">
                          {trade.mode === 'live' ? 'Cerrar live' : 'Cerrar'}
                        </button>
                      ) : (
                        <span className="text-zinc-500">Cerrado</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

      </div>
    </div>
  );
}
