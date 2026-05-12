import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  ExternalLink,
  Eye,
  EyeOff,
  Grip,
  Lock,
  Minus,
  Plus,
  RotateCcw,
  Sparkles,
  Unlock,
  Video,
  VolumeX
} from 'lucide-react';
import {
  Responsive as ResponsiveGridLayout,
  noCompactor,
  useContainerWidth,
  type Layout,
  type LayoutItem,
  type ResponsiveLayouts as Layouts
} from 'react-grid-layout';
import { recordTelemetry } from '@/services/performanceTelemetry';
import { shouldSuspendBackgroundMedia, usePerformanceProfile } from '@/hooks/usePerformanceProfile';
import type { PerformanceProfile } from '@/utils/appSettings';

const PineLabPanel = lazy(() => import('./BtcPineLabPanel'));

type TradingViewInterval = {
  label: string;
  value: string;
};

type BtcVideo = {
  id: string;
  panelId: BtcVideoPanelId;
  videoId: string;
  label: string;
};

type BtcPanelId =
  | 'tradingview'
  | 'video-lguyk36ll1c'
  | 'video-69jd1doq4c8'
  | 'video-juerq34pc5c'
  | 'pine';

type BtcVideoPanelId = Exclude<BtcPanelId, 'tradingview' | 'pine'>;
type BtcPanelVisibility = Record<BtcPanelId, boolean>;
type PineLabMode = 'drawer' | 'pinned';
type BtcLayoutPreset = 'balanced' | 'video-focus' | 'chart-focus' | 'mosaic';
type BtcPerformanceMode = 'all-videos' | 'focus';
type YoutubePlaybackQuality = 'small' | 'medium' | 'large' | 'hd720';

type BtcLayoutState = {
  layouts: Layouts;
  visibility: BtcPanelVisibility;
  pineLabMode: PineLabMode;
};

const BTC_LAYOUT_STORAGE_KEY = 'hedge-station:btc-analysis-layout:v6';
const BTC_PERFORMANCE_MODE: BtcPerformanceMode = 'all-videos';
const VIDEO_OFFSCREEN_SUSPEND_MS = 10_000;
const FRAME_GUARD_WARMUP_MS = 20_000;
const FRAME_GUARD_POOR_WINDOWS = 8;
const FRAME_GUARD_MIN_FPS = 20;
const FRAME_GUARD_MAX_GAP_MS = 350;
const gridBreakpoints = { lg: 1320, md: 1040, sm: 760, xs: 480, xxs: 0 };
const gridCols = { lg: 24, md: 18, sm: 12, xs: 8, xxs: 4 };
const layoutBreakpoints = Object.keys(gridCols) as Array<keyof typeof gridCols>;

const presetButtons: Array<{ id: BtcLayoutPreset; label: string; icon: JSX.Element }> = [
  { id: 'balanced', label: 'Balance', icon: <Grip size={12} /> },
  { id: 'video-focus', label: 'Video', icon: <Video size={12} /> },
  { id: 'chart-focus', label: 'TV', icon: <BarChart3 size={12} /> },
  { id: 'mosaic', label: 'Mosaico', icon: <Grip size={12} /> }
];

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
    panelId: 'video-lguyk36ll1c',
    videoId: 'LgUYk36ll1c',
    label: 'Stream 1'
  },
  {
    id: '69jd1doq4c8',
    panelId: 'video-69jd1doq4c8',
    videoId: '69jd1dOq4C8',
    label: 'Stream 2'
  },
  {
    id: 'juerq34pc5c',
    panelId: 'video-juerq34pc5c',
    videoId: 'JUerQ34pC5c',
    label: 'Members'
  }
];

function selectYoutubePlaybackQuality(
  profile: PerformanceProfile,
  isActivePanel: boolean,
  mode: BtcPerformanceMode
): YoutubePlaybackQuality {
  if (profile === 'full') {
    return isActivePanel || mode === 'focus' ? 'hd720' : 'large';
  }
  if (profile === 'ultra-light') {
    return isActivePanel || mode === 'focus' ? 'medium' : 'small';
  }
  return isActivePanel || mode === 'focus' ? 'large' : 'medium';
}

const defaultVisibility: BtcPanelVisibility = {
  tradingview: true,
  'video-lguyk36ll1c': true,
  'video-69jd1doq4c8': true,
  'video-juerq34pc5c': true,
  pine: false
};

const defaultLayouts: Layouts = {
  lg: [
    { i: 'tradingview', x: 0, y: 0, w: 15, h: 20, minW: 5, minH: 7 },
    { i: 'video-lguyk36ll1c', x: 15, y: 0, w: 9, h: 6, minW: 3, minH: 3 },
    { i: 'video-69jd1doq4c8', x: 15, y: 6, w: 9, h: 6, minW: 3, minH: 3 },
    { i: 'video-juerq34pc5c', x: 15, y: 12, w: 9, h: 8, minW: 3, minH: 3 },
    { i: 'pine', x: 0, y: 20, w: 24, h: 14, minW: 8, minH: 8 }
  ],
  md: [
    { i: 'tradingview', x: 0, y: 0, w: 12, h: 20, minW: 5, minH: 7 },
    { i: 'video-lguyk36ll1c', x: 12, y: 0, w: 6, h: 6, minW: 3, minH: 3 },
    { i: 'video-69jd1doq4c8', x: 12, y: 6, w: 6, h: 6, minW: 3, minH: 3 },
    { i: 'video-juerq34pc5c', x: 12, y: 12, w: 6, h: 8, minW: 3, minH: 3 },
    { i: 'pine', x: 0, y: 20, w: 18, h: 14, minW: 6, minH: 8 }
  ],
  sm: [
    { i: 'tradingview', x: 0, y: 0, w: 12, h: 16, minW: 4, minH: 7 },
    { i: 'video-lguyk36ll1c', x: 0, y: 16, w: 4, h: 6, minW: 2, minH: 3 },
    { i: 'video-69jd1doq4c8', x: 4, y: 16, w: 4, h: 6, minW: 2, minH: 3 },
    { i: 'video-juerq34pc5c', x: 8, y: 16, w: 4, h: 6, minW: 2, minH: 3 },
    { i: 'pine', x: 0, y: 22, w: 12, h: 13, minW: 4, minH: 8 }
  ],
  xs: [
    { i: 'tradingview', x: 0, y: 0, w: 8, h: 14, minW: 4, minH: 7 },
    { i: 'video-lguyk36ll1c', x: 0, y: 14, w: 8, h: 7, minW: 3, minH: 3 },
    { i: 'video-69jd1doq4c8', x: 0, y: 21, w: 8, h: 7, minW: 3, minH: 3 },
    { i: 'video-juerq34pc5c', x: 0, y: 28, w: 8, h: 7, minW: 3, minH: 3 },
    { i: 'pine', x: 0, y: 35, w: 8, h: 14, minW: 4, minH: 8 }
  ],
  xxs: [
    { i: 'tradingview', x: 0, y: 0, w: 4, h: 14, minW: 3, minH: 7 },
    { i: 'video-lguyk36ll1c', x: 0, y: 14, w: 4, h: 7, minW: 2, minH: 3 },
    { i: 'video-69jd1doq4c8', x: 0, y: 21, w: 4, h: 7, minW: 2, minH: 3 },
    { i: 'video-juerq34pc5c', x: 0, y: 28, w: 4, h: 7, minW: 2, minH: 3 },
    { i: 'pine', x: 0, y: 35, w: 4, h: 15, minW: 3, minH: 8 }
  ]
};

const defaultLayoutState: BtcLayoutState = {
  layouts: defaultLayouts,
  visibility: defaultVisibility,
  pineLabMode: 'drawer'
};

const layoutPresets: Record<BtcLayoutPreset, Layouts> = {
  balanced: defaultLayouts,
  'video-focus': {
    lg: [
      { i: 'tradingview', x: 0, y: 0, w: 8, h: 20, minW: 5, minH: 7 },
      { i: 'video-lguyk36ll1c', x: 8, y: 0, w: 16, h: 10, minW: 3, minH: 3 },
      { i: 'video-69jd1doq4c8', x: 8, y: 10, w: 8, h: 10, minW: 3, minH: 3 },
      { i: 'video-juerq34pc5c', x: 16, y: 10, w: 8, h: 10, minW: 3, minH: 3 },
      { i: 'pine', x: 0, y: 20, w: 24, h: 14, minW: 8, minH: 8 }
    ],
    md: [
      { i: 'tradingview', x: 0, y: 0, w: 6, h: 20, minW: 5, minH: 7 },
      { i: 'video-lguyk36ll1c', x: 6, y: 0, w: 12, h: 10, minW: 3, minH: 3 },
      { i: 'video-69jd1doq4c8', x: 6, y: 10, w: 6, h: 10, minW: 3, minH: 3 },
      { i: 'video-juerq34pc5c', x: 12, y: 10, w: 6, h: 10, minW: 3, minH: 3 },
      { i: 'pine', x: 0, y: 20, w: 18, h: 14, minW: 6, minH: 8 }
    ],
    sm: [
      { i: 'tradingview', x: 0, y: 0, w: 12, h: 11, minW: 4, minH: 7 },
      { i: 'video-lguyk36ll1c', x: 0, y: 11, w: 12, h: 10, minW: 2, minH: 3 },
      { i: 'video-69jd1doq4c8', x: 0, y: 21, w: 6, h: 8, minW: 2, minH: 3 },
      { i: 'video-juerq34pc5c', x: 6, y: 21, w: 6, h: 8, minW: 2, minH: 3 },
      { i: 'pine', x: 0, y: 29, w: 12, h: 13, minW: 4, minH: 8 }
    ],
    xs: [
      { i: 'tradingview', x: 0, y: 0, w: 8, h: 10, minW: 4, minH: 7 },
      { i: 'video-lguyk36ll1c', x: 0, y: 10, w: 8, h: 10, minW: 3, minH: 3 },
      { i: 'video-69jd1doq4c8', x: 0, y: 20, w: 8, h: 8, minW: 3, minH: 3 },
      { i: 'video-juerq34pc5c', x: 0, y: 28, w: 8, h: 8, minW: 3, minH: 3 },
      { i: 'pine', x: 0, y: 36, w: 8, h: 14, minW: 4, minH: 8 }
    ],
    xxs: [
      { i: 'tradingview', x: 0, y: 0, w: 4, h: 10, minW: 3, minH: 7 },
      { i: 'video-lguyk36ll1c', x: 0, y: 10, w: 4, h: 10, minW: 2, minH: 3 },
      { i: 'video-69jd1doq4c8', x: 0, y: 20, w: 4, h: 8, minW: 2, minH: 3 },
      { i: 'video-juerq34pc5c', x: 0, y: 28, w: 4, h: 8, minW: 2, minH: 3 },
      { i: 'pine', x: 0, y: 36, w: 4, h: 15, minW: 3, minH: 8 }
    ]
  },
  'chart-focus': {
    lg: [
      { i: 'tradingview', x: 0, y: 0, w: 18, h: 22, minW: 5, minH: 7 },
      { i: 'video-lguyk36ll1c', x: 18, y: 0, w: 6, h: 7, minW: 3, minH: 3 },
      { i: 'video-69jd1doq4c8', x: 18, y: 7, w: 6, h: 7, minW: 3, minH: 3 },
      { i: 'video-juerq34pc5c', x: 18, y: 14, w: 6, h: 8, minW: 3, minH: 3 },
      { i: 'pine', x: 0, y: 22, w: 24, h: 14, minW: 8, minH: 8 }
    ],
    md: [
      { i: 'tradingview', x: 0, y: 0, w: 13, h: 22, minW: 5, minH: 7 },
      { i: 'video-lguyk36ll1c', x: 13, y: 0, w: 5, h: 7, minW: 3, minH: 3 },
      { i: 'video-69jd1doq4c8', x: 13, y: 7, w: 5, h: 7, minW: 3, minH: 3 },
      { i: 'video-juerq34pc5c', x: 13, y: 14, w: 5, h: 8, minW: 3, minH: 3 },
      { i: 'pine', x: 0, y: 22, w: 18, h: 14, minW: 6, minH: 8 }
    ],
    sm: defaultLayouts.sm,
    xs: defaultLayouts.xs,
    xxs: defaultLayouts.xxs
  },
  mosaic: {
    lg: [
      { i: 'tradingview', x: 0, y: 0, w: 12, h: 13, minW: 5, minH: 7 },
      { i: 'video-lguyk36ll1c', x: 12, y: 0, w: 12, h: 13, minW: 3, minH: 3 },
      { i: 'video-69jd1doq4c8', x: 0, y: 13, w: 12, h: 13, minW: 3, minH: 3 },
      { i: 'video-juerq34pc5c', x: 12, y: 13, w: 12, h: 13, minW: 3, minH: 3 },
      { i: 'pine', x: 0, y: 26, w: 24, h: 14, minW: 8, minH: 8 }
    ],
    md: [
      { i: 'tradingview', x: 0, y: 0, w: 9, h: 13, minW: 5, minH: 7 },
      { i: 'video-lguyk36ll1c', x: 9, y: 0, w: 9, h: 13, minW: 3, minH: 3 },
      { i: 'video-69jd1doq4c8', x: 0, y: 13, w: 9, h: 13, minW: 3, minH: 3 },
      { i: 'video-juerq34pc5c', x: 9, y: 13, w: 9, h: 13, minW: 3, minH: 3 },
      { i: 'pine', x: 0, y: 26, w: 18, h: 14, minW: 6, minH: 8 }
    ],
    sm: [
      { i: 'tradingview', x: 0, y: 0, w: 6, h: 12, minW: 4, minH: 7 },
      { i: 'video-lguyk36ll1c', x: 6, y: 0, w: 6, h: 12, minW: 2, minH: 3 },
      { i: 'video-69jd1doq4c8', x: 0, y: 12, w: 6, h: 12, minW: 2, minH: 3 },
      { i: 'video-juerq34pc5c', x: 6, y: 12, w: 6, h: 12, minW: 2, minH: 3 },
      { i: 'pine', x: 0, y: 24, w: 12, h: 13, minW: 4, minH: 8 }
    ],
    xs: defaultLayouts.xs,
    xxs: defaultLayouts.xxs
  }
};

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
  url.searchParams.set('autoplay', '1');
  url.searchParams.set('mute', '1');
  url.searchParams.set('playsinline', '1');
  url.searchParams.set('theme', 'dark');
  return url.toString();
}

const YOUTUBE_FOCUS_CSS = `
html,
body {
  width: 100vw !important;
  height: 100vh !important;
  margin: 0 !important;
  overflow: hidden !important;
  background: #000 !important;
}

ytd-app,
#content,
ytd-page-manager,
ytd-watch-flexy,
ytd-watch-flexy #columns,
ytd-watch-flexy #primary,
ytd-watch-flexy #primary-inner {
  width: 100vw !important;
  height: 100vh !important;
  min-height: 100vh !important;
  max-width: none !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
  background: #000 !important;
}

ytd-masthead,
#masthead-container,
#secondary,
#below,
#comments,
ytd-comments,
ytd-watch-metadata,
#related,
#chat-container,
#playlist,
#panels,
#guide,
ytd-mini-guide-renderer,
ytd-merch-shelf-renderer,
ytd-ad-slot-renderer,
#player-ads,
.ytp-paid-content-overlay,
.ytp-ce-element,
.ytp-cards-teaser {
  display: none !important;
}

ytd-watch-flexy #player,
ytd-watch-flexy #player-container-outer,
ytd-watch-flexy #player-container-inner,
ytd-watch-flexy #player-container,
ytd-watch-flexy #player-theater-container {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  max-width: none !important;
  max-height: none !important;
  margin: 0 !important;
  padding: 0 !important;
  background: #000 !important;
  z-index: 9999 !important;
}

#movie_player,
.html5-video-player,
.html5-video-container,
video {
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  max-height: none !important;
  background: #000 !important;
}

video {
  object-fit: contain !important;
}

.ytp-chrome-top,
.ytp-gradient-top {
  opacity: 0 !important;
  transition: opacity 140ms ease !important;
}

.html5-video-player:hover .ytp-chrome-top,
.html5-video-player:hover .ytp-gradient-top {
  opacity: 1 !important;
}
`;

function buildYoutubeFocusScript(quality: YoutubePlaybackQuality) {
  return `
(() => {
  const css = ${JSON.stringify(YOUTUBE_FOCUS_CSS)};
  const desiredQuality = ${JSON.stringify(quality)};
  window.__hfsYoutubeQuality = desiredQuality;
  const styleId = 'hfs-youtube-focus-style';
  let style = document.getElementById(styleId);
  if (!style) {
    style = document.createElement('style');
    style.id = styleId;
    (document.head || document.documentElement).appendChild(style);
  }
  if (style.textContent !== css) {
    style.textContent = css;
  }

  const flexy = document.querySelector('ytd-watch-flexy');
  if (flexy) {
    flexy.setAttribute('theater', '');
    flexy.setAttribute('full-bleed-player', '');
  }

  const player = document.getElementById('movie_player');
  if (player) {
    try { player.mute?.(); } catch (_) {}
    try { player.setVolume?.(0); } catch (_) {}
    try { player.setPlaybackQualityRange?.(desiredQuality, desiredQuality); } catch (_) {}
    try { player.setPlaybackQuality?.(desiredQuality); } catch (_) {}
    try { player.playVideo?.(); } catch (_) {}
  }

  document.querySelectorAll('video').forEach((video) => {
    video.muted = true;
    video.volume = 0;
    video.playsInline = true;
    if (video.paused) {
      video.play().catch(() => {});
    }
  });

  if (!window.__hfsYoutubeFocusObserver && window.MutationObserver) {
    window.__hfsYoutubeFocusObserver = new MutationObserver(() => {
      document.querySelectorAll('video').forEach((video) => {
        video.muted = true;
        video.volume = 0;
      });
      const nextPlayer = document.getElementById('movie_player');
      if (nextPlayer) {
        const nextQuality = window.__hfsYoutubeQuality || desiredQuality;
        try { nextPlayer.setPlaybackQualityRange?.(nextQuality, nextQuality); } catch (_) {}
        try { nextPlayer.setPlaybackQuality?.(nextQuality); } catch (_) {}
      }
    });
    window.__hfsYoutubeFocusObserver.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
`;
}

export default function BtcAnalysisPage() {
  const [interval, setInterval] = useState(intervals[2].value);
  const [isEditing, setIsEditing] = useState(false);
  const [isPineDrawerOpen, setIsPineDrawerOpen] = useState(false);
  const [layoutState, setLayoutState] = useState<BtcLayoutState>(() => loadBtcLayoutState());
  const [performanceMode, setPerformanceMode] = useState<BtcPerformanceMode>(BTC_PERFORMANCE_MODE);
  const [activeVideoPanelId, setActiveVideoPanelId] = useState<BtcVideoPanelId | null>(() => getActiveVideoPanelId(layoutState.visibility) ?? btcVideos[0]?.panelId ?? null);
  const [autoSuspendEnabled, setAutoSuspendEnabled] = useState(true);
  const performanceProfile = usePerformanceProfile();
  const suspendBackgroundMedia = shouldSuspendBackgroundMedia(performanceProfile);
  const { width: gridWidth, containerRef } = useContainerWidth({ initialWidth: 1280 });
  const setGridContainerRef = useCallback((node: HTMLDivElement | null) => {
    (containerRef as { current: HTMLDivElement | null }).current = node;
  }, [containerRef]);
  const tradingViewUrl = useMemo(() => buildTradingViewUrl(interval), [interval]);
  const visibleLayouts = useMemo(
    () => filterLayoutsForVisibility(layoutState.layouts, layoutState.visibility),
    [layoutState.layouts, layoutState.visibility]
  );

  useEffect(() => {
    saveBtcLayoutState(layoutState);
  }, [layoutState]);

  const applyVideoMode = useCallback((mode: BtcPerformanceMode, panelId: BtcVideoPanelId | null, reason: string) => {
    const nextPanelId = panelId ?? btcVideos[0]?.panelId ?? null;
    setPerformanceMode(mode);
    setActiveVideoPanelId(nextPanelId);
    setLayoutState((current) => ({
      ...current,
      visibility: visibilityForVideoMode(current.visibility, mode, nextPanelId)
    }));
    recordTelemetry({
      type: 'webview',
      label: 'btc:youtube',
      status: mode,
      detail: nextPanelId ? `${reason}:${nextPanelId}` : reason
    });
  }, []);

  const suspendForFrameGuard = useCallback(() => {
    applyVideoMode('focus', activeVideoPanelId, 'frame-guard-focus');
  }, [activeVideoPanelId, applyVideoMode]);

  useBtcFrameGuard(autoSuspendEnabled && suspendBackgroundMedia && activeVideoPanelId !== null, suspendForFrameGuard);

  const setPanelVisible = useCallback((panelId: BtcPanelId, visible: boolean) => {
    if (panelId === 'tradingview') {
      return;
    }

    if (isVideoPanelId(panelId)) {
      applyVideoMode(visible ? 'focus' : 'all-videos', panelId, visible ? 'manual-show-focus' : 'manual-return-all');
      return;
    }

    setLayoutState((current) => ({
      ...current,
      visibility: {
        ...current.visibility,
        tradingview: true,
        pine: visible
      }
    }));
  }, [applyVideoMode]);

  const toggleVideoPanel = useCallback((panelId: BtcVideoPanelId) => {
    const isFocusedPanel = performanceMode === 'focus' && activeVideoPanelId === panelId;
    applyVideoMode(isFocusedPanel ? 'all-videos' : 'focus', panelId, isFocusedPanel ? 'quick-return-all' : 'quick-focus');
  }, [activeVideoPanelId, applyVideoMode, performanceMode]);

  const handleLayoutChange = useCallback((_currentLayout: Layout, allLayouts: Layouts) => {
    if (!isEditing) {
      return;
    }
    setLayoutState((current) => ({
      ...current,
      layouts: mergeLayouts(current.layouts, allLayouts)
    }));
  }, [isEditing]);

  const resetLayout = useCallback(() => {
    setLayoutState(cloneLayoutState(defaultLayoutState));
    setPerformanceMode(BTC_PERFORMANCE_MODE);
    setActiveVideoPanelId(btcVideos[0]?.panelId ?? null);
    setIsPineDrawerOpen(false);
    setIsEditing(false);
  }, []);

  const applyLayoutPreset = useCallback((preset: BtcLayoutPreset) => {
    const nextActiveVideoPanelId = activeVideoPanelId ?? btcVideos[0]?.panelId ?? null;
    setActiveVideoPanelId(nextActiveVideoPanelId);
    setLayoutState((current) => ({
      ...current,
      pineLabMode: preset === 'video-focus' ? 'drawer' : current.pineLabMode,
      visibility: visibilityForVideoMode({
        ...current.visibility,
        tradingview: true,
        pine: preset === 'video-focus' ? false : current.visibility.pine
      }, performanceMode, nextActiveVideoPanelId),
      layouts: cloneLayouts(layoutPresets[preset])
    }));
    recordTelemetry({
      type: 'webview',
      label: 'btc:preset',
      status: preset,
      detail: nextActiveVideoPanelId ? `mode=${performanceMode};active-video=${nextActiveVideoPanelId}` : `mode=${performanceMode}`
    });
    if (preset === 'video-focus') {
      setIsPineDrawerOpen(false);
    }
  }, [activeVideoPanelId, performanceMode]);

  const resizePanel = useCallback((panelId: BtcPanelId, direction: 'grow' | 'shrink') => {
    setLayoutState((current) => ({
      ...current,
      layouts: resizePanelInLayouts(current.layouts, panelId, direction)
    }));
  }, []);

  const openPineLab = useCallback(() => {
    if (layoutState.pineLabMode === 'pinned') {
      setPanelVisible('pine', true);
      return;
    }
    setIsPineDrawerOpen(true);
  }, [layoutState.pineLabMode, setPanelVisible]);

  const pinPineLab = useCallback(() => {
    setLayoutState((current) => ({
      ...current,
      pineLabMode: 'pinned',
      visibility: {
        ...current.visibility,
        pine: true
      }
    }));
    setIsPineDrawerOpen(false);
  }, []);

  const unpinPineLab = useCallback(() => {
    setLayoutState((current) => ({
      ...current,
      pineLabMode: 'drawer',
      visibility: {
        ...current.visibility,
        pine: false
      }
    }));
    setIsPineDrawerOpen(true);
  }, []);

  const closePineLab = useCallback(() => {
    setLayoutState((current) => ({
      ...current,
      pineLabMode: 'drawer',
      visibility: {
        ...current.visibility,
        pine: false
      }
    }));
    setIsPineDrawerOpen(false);
  }, []);

  const activeVideo = btcVideos.find((video) => video.panelId === activeVideoPanelId) ?? null;
  const activeVideoCount = btcVideos.filter((video) => layoutState.visibility[video.panelId]).length;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#05070b] text-slate-100">
      <BtcWorkbenchStyles />
      <header className="shrink-0 border-b border-white/10 bg-black/35 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200/70">
              <BarChart3 size={14} />
              BTC analysis station
            </div>
            <h1 className="mt-1 text-xl font-bold text-white">BTC Lean Workbench</h1>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
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

            <ToolbarButton
              active={isEditing}
              icon={isEditing ? <Lock size={14} /> : <Unlock size={14} />}
              label={isEditing ? 'Bloquear' : 'Editar'}
              title={isEditing ? 'Bloquear layout' : 'Editar layout'}
              onClick={() => setIsEditing((value) => !value)}
            />
            <ToolbarButton
              icon={<RotateCcw size={14} />}
              label="Reset"
              title="Restaurar layout BTC"
              onClick={resetLayout}
            />
            <ToolbarButton
              active={isPineDrawerOpen || layoutState.visibility.pine}
              icon={<Sparkles size={14} />}
              label="Pine Lab"
              title="Abrir Pine AI Lab"
              onClick={openPineLab}
            />
            <ToolbarButton
              active={autoSuspendEnabled}
              icon={autoSuspendEnabled ? <EyeOff size={14} /> : <Eye size={14} />}
              label={autoSuspendEnabled ? 'Auto sleep' : 'Manual'}
              title="Alternar auto-suspension de videos"
              onClick={() => setAutoSuspendEnabled((value) => !value)}
            />
            <ToolbarButton
              active={performanceMode === 'all-videos'}
              icon={<Video size={14} />}
              label={performanceMode === 'focus' ? '3 videos' : 'Focus'}
              title={performanceMode === 'focus' ? 'Volver a cargar los 3 videos' : 'Cargar solo el stream enfocado'}
              onClick={() => applyVideoMode(
                performanceMode === 'focus' ? 'all-videos' : 'focus',
                activeVideoPanelId ?? btcVideos[0]?.panelId ?? null,
                performanceMode === 'focus' ? 'toolbar-all-videos' : 'toolbar-focus'
              )}
            />

            <div className="flex rounded-md border border-white/10 bg-white/[0.03] p-1">
              {presetButtons.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyLayoutPreset(preset.id)}
                  className="inline-flex h-8 items-center gap-1.5 rounded px-2 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
                  title={`Aplicar layout ${preset.label}`}
                >
                  {preset.icon}
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="flex rounded-md border border-white/10 bg-white/[0.03] p-1">
              {btcVideos.map((video) => (
                <button
                  key={video.id}
                  type="button"
                  onClick={() => toggleVideoPanel(video.panelId)}
	                  className={`inline-flex h-8 items-center gap-1.5 rounded px-2 text-[11px] font-bold uppercase tracking-[0.1em] transition ${
	                    performanceMode === 'focus' && activeVideoPanelId === video.panelId
	                      ? 'bg-orange-400/12 text-orange-100'
	                      : 'text-slate-500 hover:bg-white/[0.06] hover:text-slate-200'
	                  }`}
	                  title={performanceMode === 'focus' && activeVideoPanelId === video.panelId ? 'Volver a 3 videos' : `Focus ${video.label}`}
	                >
	                  {performanceMode === 'focus' && activeVideoPanelId === video.panelId ? <Eye size={12} /> : <EyeOff size={12} />}
	                  {video.label.replace('Stream ', 'S')}
	                </button>
              ))}
            </div>

            <div className="inline-flex h-9 items-center gap-2 rounded-md border border-amber-400/20 bg-amber-400/10 px-3 text-xs font-semibold text-amber-100">
              <VolumeX size={14} />
              {performanceMode === 'focus' ? 'focus' : '3 videos'} · {activeVideoCount} mounted{performanceMode === 'focus' && activeVideo ? ` · ${activeVideo.label}` : ''}
            </div>
          </div>
        </div>
      </header>

      <main className="relative min-h-0 flex-1 overflow-auto p-3">
        <div ref={setGridContainerRef} className="min-h-full">
          <ResponsiveGridLayout
            className={`btc-workbench-grid ${isEditing ? 'btc-workbench-grid-editing' : ''}`}
            width={gridWidth}
            layouts={visibleLayouts}
            breakpoints={gridBreakpoints}
            cols={gridCols}
            rowHeight={24}
            margin={[8, 8]}
            containerPadding={[0, 0]}
            compactor={noCompactor}
            dragConfig={{
              enabled: isEditing,
              handle: '.btc-drag-handle',
              cancel: 'button, textarea, input, pre'
            }}
            resizeConfig={{
              enabled: isEditing,
              handles: ['se', 'e', 's']
            }}
            onLayoutChange={handleLayoutChange}
          >
            <div key="tradingview" className="min-h-0 min-w-0">
              <TradingViewPanel
                interval={interval}
                isEditing={isEditing}
                tradingViewUrl={tradingViewUrl}
                suspendWhenHidden={suspendBackgroundMedia}
                onGrow={() => resizePanel('tradingview', 'grow')}
                onShrink={() => resizePanel('tradingview', 'shrink')}
              />
            </div>

            {btcVideos.map((video) => (
              layoutState.visibility[video.panelId] ? (
                <div key={video.panelId} className="min-h-0 min-w-0">
	                  <VideoPanel
	                    video={video}
	                    isEditing={isEditing}
	                    performanceMode={performanceMode}
	                    autoSuspendEnabled={autoSuspendEnabled && suspendBackgroundMedia}
	                    suspendWhenHidden={suspendBackgroundMedia}
	                    quality={selectYoutubePlaybackQuality(
	                      performanceProfile,
	                      video.panelId === activeVideoPanelId,
	                      performanceMode
	                    )}
	                    onGrow={() => resizePanel(video.panelId, 'grow')}
	                    onShrink={() => resizePanel(video.panelId, 'shrink')}
	                    onFocusOnly={() => applyVideoMode('focus', video.panelId, 'panel-focus')}
	                    onShowAll={() => applyVideoMode('all-videos', video.panelId, 'panel-show-all')}
	                    onSuspend={(reason) => applyVideoMode('focus', video.panelId, `${reason}-focus`)}
	                  />
                </div>
              ) : null
            ))}

            {layoutState.visibility.pine ? (
              <div key="pine" className="min-h-0 min-w-0">
                <Suspense fallback={<PineLabFallback />}>
                  <PineLabPanel
                    interval={interval}
                    mode="pinned"
                    onClose={closePineLab}
                    onUnpin={unpinPineLab}
                  />
                </Suspense>
              </div>
            ) : null}
          </ResponsiveGridLayout>
        </div>

        {isPineDrawerOpen && layoutState.pineLabMode === 'drawer' ? (
          <div className="absolute inset-y-3 right-3 z-40 w-[min(780px,calc(100%-1.5rem))] overflow-hidden rounded-lg border border-emerald-300/20 bg-[#071018] shadow-2xl shadow-black/60">
            <Suspense fallback={<PineLabFallback />}>
              <PineLabPanel
                interval={interval}
                mode="drawer"
                onClose={closePineLab}
                onPin={pinPineLab}
              />
            </Suspense>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function TradingViewPanel({
  interval,
  isEditing,
  tradingViewUrl,
  suspendWhenHidden,
  onGrow,
  onShrink
}: {
  interval: string;
  isEditing: boolean;
  tradingViewUrl: string;
  suspendWhenHidden: boolean;
  onGrow: () => void;
  onShrink: () => void;
}) {
  const webviewRef = useRef<any>(null);
  const effectiveTradingViewUrl = useHiddenWebviewSrc(tradingViewUrl, suspendWhenHidden);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) {
      return;
    }

    recordTelemetry({ type: 'webview', label: 'btc:tradingview', status: 'mounted', detail: effectiveTradingViewUrl === 'about:blank' ? 'hidden-suspended' : interval });
    return () => {
      cleanupWebview(webview);
      recordTelemetry({ type: 'webview', label: 'btc:tradingview', status: 'unmounted', detail: effectiveTradingViewUrl === 'about:blank' ? 'hidden-suspended' : interval });
    };
  }, [effectiveTradingViewUrl, interval]);

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-white/10 bg-[#131722]">
      <div className={`flex h-11 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/30 px-3 ${isEditing ? 'btc-drag-handle cursor-move' : ''}`}>
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-white">TradingView BTCUSDT</div>
          <div className="truncate text-xs text-slate-500">Layout y login persistentes en la particion TradingView.</div>
        </div>
        <div className="inline-flex items-center gap-2 rounded border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-xs font-semibold text-cyan-100">
          {isEditing ? <Grip size={13} /> : null}
          {intervals.find((item) => item.value === interval)?.label ?? '1h'}
        </div>
        {isEditing ? (
          <PanelSizeControls
            tone="cyan"
            onGrow={onGrow}
            onShrink={onShrink}
          />
        ) : null}
      </div>
      <div className="relative min-h-0 flex-1">
        <webview
          ref={(node) => {
            webviewRef.current = node;
          }}
          key={effectiveTradingViewUrl}
          src={effectiveTradingViewUrl}
          className="h-full w-full"
          partition="persist:tradingview"
          allowpopups={false}
        />
        {isEditing ? <div className="btc-drag-handle absolute inset-0 z-10 cursor-move bg-cyan-300/[0.03]" /> : null}
      </div>
    </section>
  );
}

function VideoPanel({
  video,
  isEditing,
  performanceMode,
  autoSuspendEnabled,
  suspendWhenHidden,
  quality,
  onGrow,
  onShrink,
  onFocusOnly,
  onShowAll,
  onSuspend
}: {
  video: BtcVideo;
  isEditing: boolean;
  performanceMode: BtcPerformanceMode;
  autoSuspendEnabled: boolean;
  suspendWhenHidden: boolean;
  quality: YoutubePlaybackQuality;
  onGrow: () => void;
  onShrink: () => void;
  onFocusOnly: () => void;
  onShowAll: () => void;
  onSuspend: (reason: string) => void;
}) {
  const watchUrl = useMemo(() => buildYoutubeWatchUrl(video.videoId), [video.videoId]);
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!autoSuspendEnabled || !panelRef.current || typeof IntersectionObserver === 'undefined') {
      return;
    }

    let offscreenTimer: number | null = null;
    const clearOffscreenTimer = () => {
      if (offscreenTimer !== null) {
        window.clearTimeout(offscreenTimer);
        offscreenTimer = null;
      }
    };

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry || entry.isIntersecting) {
        clearOffscreenTimer();
        return;
      }

      clearOffscreenTimer();
      offscreenTimer = window.setTimeout(() => {
        onSuspend('offscreen');
      }, VIDEO_OFFSCREEN_SUSPEND_MS);
    }, { threshold: 0.05 });

    observer.observe(panelRef.current);
    return () => {
      clearOffscreenTimer();
      observer.disconnect();
    };
  }, [autoSuspendEnabled, onSuspend]);

  return (
    <section ref={panelRef} className="group relative h-full min-h-0 min-w-0 overflow-hidden rounded-md border border-white/[0.06] bg-black">
      <FocusedYoutubeWebview src={watchUrl} suspendWhenHidden={suspendWhenHidden} quality={quality} />
      {isEditing ? <div className="btc-drag-handle absolute inset-0 z-10 cursor-move bg-orange-300/[0.04]" /> : null}

      <div className={`absolute left-2 top-2 z-20 inline-flex max-w-[calc(100%-9rem)] items-center gap-1.5 rounded border border-black/50 bg-black/55 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-orange-50 shadow-lg transition ${isEditing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        {isEditing ? <Grip size={12} /> : <Video size={12} />}
        <span className="truncate">{video.label}</span>
      </div>

      <div className={`absolute right-2 top-2 z-30 flex gap-1 transition ${isEditing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        {isEditing ? (
          <>
            <IconButton title="Agrandar panel" onClick={onGrow}>
              <Plus size={13} />
            </IconButton>
            <IconButton title="Achicar panel" onClick={onShrink}>
              <Minus size={13} />
            </IconButton>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => void window.electronAPI.external.openUrlInBrave(watchUrl)}
          className="inline-flex h-7 w-7 items-center justify-center rounded border border-black/50 bg-black/60 text-slate-200 transition hover:bg-black/80 hover:text-white"
          title="Abrir este stream en Brave"
        >
          <ExternalLink size={13} />
        </button>
        {performanceMode === 'focus' ? (
          <button
            type="button"
            onClick={onShowAll}
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-black/50 bg-black/60 text-slate-200 transition hover:bg-black/80 hover:text-white"
            title="Volver a cargar los 3 videos"
          >
            <Eye size={13} />
          </button>
        ) : (
          <button
            type="button"
            onClick={onFocusOnly}
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-black/50 bg-black/60 text-slate-200 transition hover:bg-black/80 hover:text-white"
            title="Cargar solo este stream"
          >
            <EyeOff size={13} />
          </button>
        )}
      </div>
    </section>
  );
}

function FocusedYoutubeWebview({
  src,
  suspendWhenHidden,
  quality
}: {
  src: string;
  suspendWhenHidden: boolean;
  quality: YoutubePlaybackQuality;
}) {
  const webviewRef = useRef<any>(null);
  const effectiveSrc = useHiddenWebviewSrc(src, suspendWhenHidden);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) {
      return;
    }

    const focusAndMute = () => {
      try {
        webview.setAudioMuted?.(true);
      } catch {
        // Best effort: YouTube can be mid-navigation while mounting.
      }

      try {
        void webview.executeJavaScript?.(
          buildYoutubeFocusScript(quality),
          true
        );
      } catch {
        // Best effort only; the webview-level mute above is the primary guard.
      }
    };

    webview.addEventListener?.('dom-ready', focusAndMute);
    webview.addEventListener?.('did-finish-load', focusAndMute);
    webview.addEventListener?.('did-navigate', focusAndMute);
    focusAndMute();
    recordTelemetry({ type: 'webview', label: 'btc:youtube', status: 'mounted', detail: effectiveSrc === 'about:blank' ? 'hidden-suspended' : `${src}:quality=${quality}` });

    return () => {
      webview.removeEventListener?.('dom-ready', focusAndMute);
      webview.removeEventListener?.('did-finish-load', focusAndMute);
      webview.removeEventListener?.('did-navigate', focusAndMute);
      cleanupWebview(webview);
      recordTelemetry({ type: 'webview', label: 'btc:youtube', status: 'unmounted', detail: effectiveSrc === 'about:blank' ? 'hidden-suspended' : `${src}:quality=${quality}` });
    };
  }, [effectiveSrc, quality, src]);

  return (
    <webview
      ref={(node) => {
        webviewRef.current = node;
      }}
      key={effectiveSrc}
      src={effectiveSrc}
      className="h-full w-full bg-black"
      partition="persist:youtube"
      allowpopups={false}
      allowFullScreen
    />
  );
}

function PineLabFallback() {
  return (
    <section className="flex h-full min-h-[320px] items-center justify-center rounded-lg border border-white/10 bg-[#071018] px-4 text-sm font-semibold text-emerald-100">
      Cargando Pine AI Lab...
    </section>
  );
}

function ToolbarButton({
  icon,
  label,
  title,
  active = false,
  onClick
}: {
  icon: JSX.Element;
  label: string;
  title: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-bold transition ${
        active
          ? 'border-cyan-300/25 bg-cyan-400/12 text-cyan-100'
          : 'border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function PanelSizeControls({
  onGrow,
  onShrink,
  tone
}: {
  onGrow: () => void;
  onShrink: () => void;
  tone: 'cyan' | 'orange';
}) {
  const activeClass = tone === 'cyan'
    ? 'border-cyan-300/25 bg-cyan-400/12 text-cyan-100 hover:bg-cyan-400/18'
    : 'border-orange-300/25 bg-orange-400/12 text-orange-100 hover:bg-orange-400/18';

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={onGrow}
        title="Agrandar panel"
        className={`inline-flex h-7 w-7 items-center justify-center rounded border transition ${activeClass}`}
      >
        <Plus size={13} />
      </button>
      <button
        type="button"
        onClick={onShrink}
        title="Achicar panel"
        className={`inline-flex h-7 w-7 items-center justify-center rounded border transition ${activeClass}`}
      >
        <Minus size={13} />
      </button>
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

function useBtcFrameGuard(enabled: boolean, onSuspend: () => void) {
  const onSuspendRef = useRef(onSuspend);

  useEffect(() => {
    onSuspendRef.current = onSuspend;
  }, [onSuspend]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let animationFrame = 0;
    let lastFrameAt = performance.now();
    const guardStartedAt = lastFrameAt;
    let windowStartedAt = lastFrameAt;
    let frames = 0;
    let maxGapMs = 0;
    let poorWindows = 0;

    const tick = (now: number) => {
      const gapMs = now - lastFrameAt;
      lastFrameAt = now;
      frames += 1;
      maxGapMs = Math.max(maxGapMs, gapMs);

      const windowMs = now - windowStartedAt;
      if (windowMs >= 1000) {
        const fps = Math.round((frames * 1000) / windowMs);
        const isWarmedUp = now - guardStartedAt >= FRAME_GUARD_WARMUP_MS;
        const isPoor = isWarmedUp && (fps < FRAME_GUARD_MIN_FPS || maxGapMs > FRAME_GUARD_MAX_GAP_MS);
        poorWindows = isPoor ? poorWindows + 1 : 0;

        recordTelemetry({
          type: 'fps',
          label: 'btc:frame-guard',
          durationMs: Math.round(maxGapMs),
          status: isPoor ? 'poor' : 'ok',
          detail: `fps=${fps}`
        });

        if (poorWindows >= FRAME_GUARD_POOR_WINDOWS) {
          onSuspendRef.current();
          return;
        }

        windowStartedAt = now;
        frames = 0;
        maxGapMs = 0;
      }

      animationFrame = window.requestAnimationFrame(tick);
    };

    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [enabled]);
}

function useHiddenWebviewSrc(src: string, enabled: boolean) {
  const [isHidden, setIsHidden] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsHidden(false);
      return undefined;
    }

    const syncHiddenState = () => {
      setIsHidden(document.hidden);
    };
    const resumeWebview = () => {
      setIsHidden(false);
    };

    syncHiddenState();
    document.addEventListener('visibilitychange', syncHiddenState);
    window.addEventListener('focus', resumeWebview);
    window.addEventListener('pageshow', resumeWebview);
    return () => {
      document.removeEventListener('visibilitychange', syncHiddenState);
      window.removeEventListener('focus', resumeWebview);
      window.removeEventListener('pageshow', resumeWebview);
    };
  }, [enabled]);

  return enabled && isHidden ? 'about:blank' : src;
}

function cleanupWebview(webview: any) {
  try {
    webview.setAudioMuted?.(true);
  } catch {
    // Best effort cleanup for Electron webview guests.
  }

  try {
    webview.stop?.();
  } catch {
    // Best effort cleanup for Electron webview guests.
  }

  try {
    webview.loadURL?.('about:blank');
  } catch {
    try {
      webview.src = 'about:blank';
    } catch {
      // Best effort cleanup for Electron webview guests.
    }
  }
}

function isVideoPanelId(panelId: BtcPanelId): panelId is BtcVideoPanelId {
  return btcVideos.some((video) => video.panelId === panelId);
}

function getActiveVideoPanelId(visibility: BtcPanelVisibility): BtcVideoPanelId | null {
  return btcVideos.find((video) => visibility[video.panelId])?.panelId ?? null;
}

function visibilityForVideoMode(visibility: BtcPanelVisibility, mode: BtcPerformanceMode, activeVideoPanelId: BtcVideoPanelId | null): BtcPanelVisibility {
  return btcVideos.reduce<BtcPanelVisibility>((next, video) => ({
    ...next,
    [video.panelId]: mode === 'all-videos' || video.panelId === activeVideoPanelId
  }), {
    ...visibility,
    tradingview: true
  });
}

function loadBtcLayoutState(): BtcLayoutState {
  if (typeof window === 'undefined') {
    return cloneLayoutState(defaultLayoutState);
  }

  try {
    const raw = window.localStorage.getItem(BTC_LAYOUT_STORAGE_KEY);
    if (!raw) {
      return cloneLayoutState(defaultLayoutState);
    }
    const parsed = JSON.parse(raw) as Partial<BtcLayoutState>;
    const pineLabMode: PineLabMode = parsed.pineLabMode === 'pinned' ? 'pinned' : 'drawer';
    const visibility = normalizeVisibility(parsed.visibility, pineLabMode);
    return {
      layouts: normalizeLayouts(parsed.layouts),
      visibility,
      pineLabMode
    };
  } catch {
    return cloneLayoutState(defaultLayoutState);
  }
}

function saveBtcLayoutState(state: BtcLayoutState) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(BTC_LAYOUT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Local layout persistence is a convenience, not a blocker for the BTC station.
  }
}

function normalizeVisibility(value: unknown, pineLabMode: PineLabMode): BtcPanelVisibility {
  const candidate = typeof value === 'object' && value !== null ? value as Partial<BtcPanelVisibility> : {};
  const visibility: BtcPanelVisibility = {
    ...defaultVisibility,
    ...candidate,
    tradingview: true,
    pine: pineLabMode === 'pinned'
  };
  return visibilityForVideoMode(visibility, BTC_PERFORMANCE_MODE, getActiveVideoPanelId(visibility) ?? btcVideos[0]?.panelId ?? null);
}

function normalizeLayouts(value: unknown): Layouts {
  const candidate = typeof value === 'object' && value !== null ? value as Layouts : {};
  return layoutBreakpoints.reduce<Layouts>((next, breakpoint) => {
    next[breakpoint] = mergeLayoutItems(defaultLayouts[breakpoint] || [], candidate[breakpoint] || []);
    return next;
  }, {});
}

function mergeLayouts(previous: Layouts, incoming: Layouts): Layouts {
  return layoutBreakpoints.reduce<Layouts>((next, breakpoint) => {
    next[breakpoint] = mergeLayoutItems(previous[breakpoint] || defaultLayouts[breakpoint] || [], incoming[breakpoint] || []);
    return next;
  }, {});
}

function mergeLayoutItems(previous: Layout, incoming: Layout): Layout {
  const itemsById = new Map<string, LayoutItem>();
  previous.forEach((item) => itemsById.set(item.i, { ...item }));
  incoming.forEach((item) => itemsById.set(item.i, { ...itemsById.get(item.i), ...item }));
  return Array.from(itemsById.values());
}

function resizePanelInLayouts(layouts: Layouts, panelId: BtcPanelId, direction: 'grow' | 'shrink'): Layouts {
  const factor = direction === 'grow' ? 1 : -1;
  return layoutBreakpoints.reduce<Layouts>((next, breakpoint) => {
    const cols = gridCols[breakpoint];
    const widthStep = cols >= 18 ? 2 : 1;
    const heightStep = 2;

    next[breakpoint] = (layouts[breakpoint] || defaultLayouts[breakpoint] || []).map((item) => {
      if (item.i !== panelId) {
        return { ...item };
      }

      const minW = item.minW ?? 1;
      const minH = item.minH ?? 3;
      const w = clamp(item.w + widthStep * factor, minW, cols);
      const h = clamp(item.h + heightStep * factor, minH, 40);
      const x = clamp(item.x, 0, Math.max(0, cols - w));
      return { ...item, x, w, h };
    });
    return next;
  }, {});
}

function filterLayoutsForVisibility(layouts: Layouts, visibility: BtcPanelVisibility): Layouts {
  return layoutBreakpoints.reduce<Layouts>((next, breakpoint) => {
    next[breakpoint] = (layouts[breakpoint] || []).filter((item) => visibility[item.i as BtcPanelId]);
    return next;
  }, {});
}

function cloneLayouts(layouts: Layouts): Layouts {
  return layoutBreakpoints.reduce<Layouts>((next, breakpoint) => {
    next[breakpoint] = (layouts[breakpoint] || []).map((item) => ({ ...item }));
    return next;
  }, {});
}

function cloneLayoutState(state: BtcLayoutState): BtcLayoutState {
  return {
    pineLabMode: state.pineLabMode,
    visibility: { ...state.visibility },
    layouts: cloneLayouts(state.layouts)
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function BtcWorkbenchStyles() {
  return (
    <style>
      {`
        .btc-workbench-grid {
          min-height: 100%;
        }

        .btc-workbench-grid .react-grid-item {
          transition: box-shadow 160ms ease, transform 160ms ease;
        }

        .btc-workbench-grid-editing .react-grid-item {
          box-shadow: 0 0 0 1px rgba(34, 211, 238, 0.16), 0 12px 30px rgba(0, 0, 0, 0.25);
        }

        .btc-workbench-grid-editing {
          background-image:
            linear-gradient(rgba(34, 211, 238, 0.055) 1px, transparent 1px),
            linear-gradient(90deg, rgba(34, 211, 238, 0.055) 1px, transparent 1px);
          background-size: 32px 32px;
        }

        .btc-workbench-grid .react-grid-placeholder {
          background: rgba(34, 211, 238, 0.18);
          border: 1px solid rgba(34, 211, 238, 0.35);
          border-radius: 8px;
          opacity: 1;
        }

        .btc-workbench-grid .react-resizable-handle {
          opacity: 0;
          z-index: 60;
          transition: opacity 120ms ease, background 120ms ease;
        }

        .btc-workbench-grid-editing .react-resizable-handle {
          opacity: 1;
          background: rgba(34, 211, 238, 0.14);
          border: 1px solid rgba(34, 211, 238, 0.35);
          border-radius: 999px;
        }

        .btc-workbench-grid-editing .react-resizable-handle-se {
          width: 24px;
          height: 24px;
          right: 6px;
          bottom: 6px;
        }

        .btc-workbench-grid-editing .react-resizable-handle-e {
          width: 12px;
          height: 34px;
          right: 6px;
          top: calc(50% - 17px);
        }

        .btc-workbench-grid-editing .react-resizable-handle-s {
          width: 34px;
          height: 12px;
          left: calc(50% - 17px);
          bottom: 6px;
        }

        .btc-workbench-grid .react-resizable-handle::after {
          border-color: rgba(34, 211, 238, 0.7);
        }
      `}
    </style>
  );
}
