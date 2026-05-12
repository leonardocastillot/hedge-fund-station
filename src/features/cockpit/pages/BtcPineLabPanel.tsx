import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type SeriesMarker,
  type UTCTimestamp
} from 'lightweight-charts';
import { Copy, Pin, PinOff, Play, Sparkles, X } from 'lucide-react';
import {
  hyperliquidService,
  type PineIndicatorGenerateResponse,
  type PineIndicatorPreviewLine
} from '@/services/hyperliquidService';

type PineLabMode = 'drawer' | 'pinned';

export default function BtcPineLabPanel({
  interval,
  mode,
  onClose,
  onPin,
  onUnpin
}: {
  interval: string;
  mode: PineLabMode;
  onClose: () => void;
  onPin?: () => void;
  onUnpin?: () => void;
}) {
  const [prompt, setPrompt] = useState('hazme un indicador que marque rompimientos con RSI y volumen');
  const [result, setResult] = useState<PineIndicatorGenerateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'code' | 'prompt' | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await hyperliquidService.generatePineIndicator({
        request: prompt,
        symbol: 'BTC',
        interval,
        lookback_hours: 96,
        indicator_type: 'indicator'
      });
      setResult(next);
    } catch (err: any) {
      setError(err.message || 'No se pudo generar el indicador.');
    } finally {
      setLoading(false);
    }
  };

  const copyText = async (value: string, kind: 'code' | 'prompt') => {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1300);
  };

  return (
    <section className="grid h-full min-h-0 min-w-0 overflow-hidden rounded-lg border border-white/10 bg-[#071018] lg:grid-cols-[minmax(320px,0.82fr)_minmax(0,1.18fr)]">
      <div className="flex min-h-0 flex-col border-b border-white/10 p-3 lg:border-b-0 lg:border-r">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200/80">
              <Sparkles size={14} />
              Pine AI Lab
            </div>
            <h2 className="mt-1 truncate text-base font-bold text-white">TradingView indicator builder</h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <div className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-xs font-semibold text-slate-300">
              BTC {interval}
            </div>
            {mode === 'drawer' && onPin ? (
              <IconButton title="Fijar Pine Lab al board" onClick={onPin}>
                <Pin size={13} />
              </IconButton>
            ) : null}
            {mode === 'pinned' && onUnpin ? (
              <IconButton title="Mover Pine Lab a drawer" onClick={onUnpin}>
                <PinOff size={13} />
              </IconButton>
            ) : null}
            <IconButton title="Cerrar Pine AI Lab" onClick={onClose}>
              <X size={13} />
            </IconButton>
          </div>
        </div>

        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          className="mt-3 min-h-[90px] resize-none rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-300/40"
          placeholder="Describe el indicador Pine que quieres generar..."
        />

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={generate}
            disabled={loading || prompt.trim().length < 8}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-emerald-300/25 bg-emerald-400/12 px-3 text-xs font-bold text-emerald-100 transition hover:bg-emerald-400/18 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play size={14} />
            {loading ? 'Generando...' : 'Generar Pine'}
          </button>
          <button
            type="button"
            onClick={() => void copyText(prompt, 'prompt')}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08]"
          >
            <Copy size={14} />
            {copied === 'prompt' ? 'Copiado' : 'Copiar prompt'}
          </button>
        </div>

        <div className="mt-3 rounded-md border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
          TradingView compile check still happens in Pine Editor. Este lab no inyecta codigo ni opera ordenes.
        </div>

        {error && <div className="mt-3 rounded-md border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">{error}</div>}

        {result && (
          <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-md border border-white/10 bg-black/25 p-3">
            <div className="text-sm font-bold text-white">{result.title}</div>
            <div className="mt-1 text-xs leading-5 text-slate-400">{result.description}</div>
            <MetaList title="Inputs" items={result.inputs} />
            <MetaList title="Plots" items={result.plots} />
            <MetaList title="Alerts" items={result.alerts} />
            <MetaList title="Warnings" items={result.warnings} />
          </div>
        )}
      </div>

      <div className="grid min-h-0 grid-rows-[minmax(210px,1fr)_minmax(130px,0.72fr)] overflow-hidden">
        <PinePreviewChart result={result} />
        <div className="min-h-0 overflow-hidden border-t border-white/10 bg-black/30">
          <div className="flex h-9 items-center justify-between gap-2 border-b border-white/10 px-3">
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-300">Pine Script v6</div>
            <button
              type="button"
              onClick={() => result && void copyText(result.pineCode, 'code')}
              disabled={!result}
              className="inline-flex h-7 items-center gap-2 rounded border border-white/10 bg-white/[0.04] px-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Copy size={13} />
              {copied === 'code' ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <pre className="h-[calc(100%-2.25rem)] overflow-auto whitespace-pre-wrap p-3 text-[11px] leading-5 text-slate-200">
            {result?.pineCode || 'Genera un indicador para ver aqui el Pine listo para pegar en TradingView.'}
          </pre>
        </div>
      </div>
    </section>
  );
}

function PinePreviewChart({ result }: { result: PineIndicatorGenerateResponse | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    container.innerHTML = '';
    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#071018' },
        textColor: '#94a3b8'
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.08)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.08)' }
      },
      rightPriceScale: { borderColor: 'rgba(148, 163, 184, 0.18)' },
      timeScale: { borderColor: 'rgba(148, 163, 184, 0.18)' },
      crosshair: { mode: 1 }
    });
    if (result) {
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444'
      });
      candleSeries.setData(
        result.candles.candles
          .filter((candle) => candle.open !== null && candle.high !== null && candle.low !== null && candle.close !== null)
          .map((candle) => ({
            time: Math.floor(candle.time / 1000) as UTCTimestamp,
            open: candle.open as number,
            high: candle.high as number,
            low: candle.low as number,
            close: candle.close as number
          }))
      );

      result.preview.overlays.forEach((line) => addPreviewLine(chart, line));
      createSeriesMarkers(
        candleSeries,
        result.preview.markers.map((marker): SeriesMarker<UTCTimestamp> => ({
          time: marker.time as UTCTimestamp,
          position: marker.position,
          color: marker.color,
          shape: marker.shape,
          text: marker.text
        }))
      );
    }
    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver(() => chart.timeScale().fitContent());
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [result]);

  return (
    <div className="relative min-h-0 bg-[#071018]">
      <div ref={containerRef} className="h-full min-h-[210px] w-full" />
      {!result && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-5 text-center text-sm text-slate-500">
          La preview local aparece despues de generar un indicador.
        </div>
      )}
      {result && !result.preview.supported && (
        <div className="absolute left-3 top-3 rounded border border-amber-400/20 bg-black/80 px-3 py-2 text-xs text-amber-100">
          Preview no soportada: {result.preview.reason}
        </div>
      )}
      {result && result.preview.oscillators.length > 0 && (
        <div className="absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] rounded border border-white/10 bg-black/75 px-3 py-2 text-xs text-slate-300">
          {result.preview.oscillators.map((line) => `${line.name}: ${formatLastPoint(line)}`).join(' | ')}
        </div>
      )}
    </div>
  );
}

function IconButton({
  title,
  onClick,
  children
}: {
  title: string;
  onClick: () => void;
  children: JSX.Element;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex h-7 w-7 items-center justify-center rounded border border-white/10 bg-white/[0.04] text-slate-200 transition hover:bg-white/[0.08] hover:text-white"
    >
      {children}
    </button>
  );
}

function addPreviewLine(chart: IChartApi, line: PineIndicatorPreviewLine) {
  const series = chart.addSeries(LineSeries, {
    color: line.color,
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: false
  });
  series.setData(line.points.map((point) => ({ time: point.time as UTCTimestamp, value: point.value })));
}

function formatLastPoint(line: PineIndicatorPreviewLine) {
  const last = line.points[line.points.length - 1];
  return last ? last.value.toFixed(2) : 'n/a';
}

function MetaList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div className="mt-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{title}</div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span key={item} className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-slate-300">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
