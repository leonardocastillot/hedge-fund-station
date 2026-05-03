import { useMemo, useState } from 'react';
import { BarChart3, ExternalLink } from 'lucide-react';

type TradingViewInterval = {
  label: string;
  value: string;
};

type BtcVideo = {
  id: string;
  videoId: string;
  label: string;
};

const intervals: TradingViewInterval[] = [
  { label: '5m', value: '5' },
  { label: '15m', value: '15' },
  { label: '1h', value: '60' },
  { label: '4h', value: '240' },
  { label: '1D', value: 'D' }
];

const btcVideos: BtcVideo[] = [
  {
    id: 'lguyk36ll1c',
    videoId: 'LgUYk36ll1c',
    label: 'Stream 1'
  },
  {
    id: '69jd1doq4c8',
    videoId: '69jd1dOq4C8',
    label: 'Stream 2'
  },
  {
    id: 'juerq34pc5c',
    videoId: 'JUerQ34pC5c',
    label: 'Members'
  }
];

function buildTradingViewUrl(interval: string) {
  const url = new URL('https://www.tradingview.com/chart/');
  url.searchParams.set('symbol', 'BINANCE:BTCUSDT');
  url.searchParams.set('interval', interval);
  url.searchParams.set('theme', 'dark');
  return url.toString();
}

function buildYoutubeWatchUrl(videoId: string) {
  const url = new URL('https://www.youtube.com/watch');
  url.searchParams.set('v', videoId);
  url.searchParams.set('theme', 'dark');
  return url.toString();
}

export default function BtcAnalysisPage() {
  const [interval, setInterval] = useState(intervals[2].value);
  const tradingViewUrl = useMemo(() => buildTradingViewUrl(interval), [interval]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#05070b] text-slate-100">
      <header className="border-b border-white/10 bg-black/35 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200/70">
              <BarChart3 size={14} />
              BTC analysis station
            </div>
            <h1 className="mt-1 text-xl font-bold text-white">BTC Super Panel</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border border-white/10 bg-white/[0.03] p-1">
              {intervals.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setInterval(item.value)}
                  className={`h-8 rounded px-3 text-xs font-semibold transition ${
                    interval === item.value
                      ? 'bg-cyan-400/15 text-cyan-100'
                      : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="rounded-md border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-100">
              3 streams filtrados
            </div>
          </div>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 gap-3 p-3 2xl:grid-cols-[minmax(0,1.35fr)_minmax(520px,0.95fr)]">
        <section className="flex min-h-[360px] min-w-0 flex-col overflow-hidden rounded-lg border border-white/10 bg-[#131722]">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-black/30 px-3 py-2">
            <div>
              <div className="text-sm font-bold text-white">TradingView BTCUSDT</div>
              <div className="text-xs text-slate-500">Layout y login persistentes en la particion TradingView.</div>
            </div>
            <div className="rounded border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-xs font-semibold text-cyan-100">
              {intervals.find((item) => item.value === interval)?.label ?? '1h'}
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <webview
              key={tradingViewUrl}
              src={tradingViewUrl}
              className="h-full w-full"
              partition="persist:tradingview"
              allowpopups={false}
            />
          </div>
        </section>

        <section className="grid min-h-[420px] min-w-0 grid-rows-3 gap-2 overflow-hidden rounded-lg border border-white/10 bg-black p-2">
          {btcVideos.map((video) => (
            <div
              key={video.id}
              className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-white/10 bg-[#090b10]"
            >
              <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-3">
                <div className="min-w-0 text-xs font-semibold uppercase tracking-[0.14em] text-orange-100/80">
                  {video.label}
                </div>
                <button
                  type="button"
                  onClick={() => void window.electronAPI.external.openUrlInBrave(buildYoutubeWatchUrl(video.videoId))}
                  className="inline-flex h-7 w-7 items-center justify-center rounded border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                  title="Abrir este stream en Brave"
                >
                  <ExternalLink size={13} />
                </button>
              </div>
              <webview
                src={buildYoutubeWatchUrl(video.videoId)}
                className="min-h-0 flex-1 bg-black"
                partition="persist:youtube"
                allowpopups={false}
                allowFullScreen
              />
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
