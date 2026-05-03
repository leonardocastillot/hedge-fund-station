import { hyperliquidService } from '../services/hyperliquidService';
import { strategyService } from '../services/strategyService';
import type { CommanderTask } from '../types/tasks';

export interface MissionActionResult {
  summary: string;
}

export async function runMissionAction(task: CommanderTask, actionKey: string): Promise<MissionActionResult> {
  void task;
  switch (actionKey) {
    case 'load-strategy-library': {
      const library = await strategyService.getLibrary('all', 'score');
      const top = library.strategies.slice(0, 3);
      const topSummary = top.length > 0
        ? top.map((strategy) => `${strategy.strategy_name} ${strategy.timeframe} score ${strategy.score.toFixed(1)}`).join(' | ')
        : 'No strategies returned';
      return { summary: `Loaded ${library.strategies.length} strategies. Top: ${topSummary}` };
    }
    case 'run-all-backtests': {
      const result = await strategyService.runAllBacktests('4h', 3);
      const successCount = result?.successful ?? result?.success_count ?? 0;
      const failedCount = result?.failed ?? result?.failed_count ?? 0;
      return { summary: `Gateway strategy refresh finished. Signals created: ${successCount}. Failed: ${failedCount}.` };
    }
    case 'seed-paper-signals': {
      const result = await hyperliquidService.seedPaperSignals(6);
      return { summary: `Seeded paper signals. Created: ${result.created}.` };
    }
    case 'load-paper-signals': {
      const result = await hyperliquidService.getPaperSignals(12);
      const top = result.signals.slice(0, 3);
      const topSummary = top.length > 0
        ? top.map((signal) => `${signal.symbol} ${signal.setupTag} ${signal.status}`).join(' | ')
        : 'No signals found';
      return { summary: `Loaded ${result.signals.length} paper signals. Top: ${topSummary}` };
    }
    case 'load-paper-trades': {
      const result = await hyperliquidService.getPaperTrades('all');
      const closed = result.trades.filter((trade) => trade.status === 'closed').length;
      const open = result.trades.filter((trade) => trade.status === 'open').length;
      return { summary: `Loaded ${result.trades.length} paper trades. Open: ${open}. Closed: ${closed}.` };
    }
    case 'load-overview': {
      const result = await hyperliquidService.getOverview(20);
      const leader = result.leaders.topOpportunity || result.markets[0]?.symbol || 'none';
      return { summary: `Loaded ${result.markets.length} markets. Top opportunity: ${leader}.` };
    }
    case 'load-watchlist': {
      const result = await hyperliquidService.getWatchlist(18);
      return {
        summary: `Watchlist loaded. Watch now: ${result.watchNow.length}. Wait trigger: ${result.waitTrigger.length}. Avoid: ${result.avoid.length}.`
      };
    }
    case 'load-alerts': {
      const result = await hyperliquidService.getAlerts(16);
      const highSeverity = result.alerts.filter((alert) => alert.severity === 'high').length;
      return { summary: `Loaded ${result.alerts.length} alerts. High severity: ${highSeverity}.` };
    }
    default:
      throw new Error(`Unsupported mission action: ${actionKey}`);
  }
}
