import type { HyperliquidMarketRow } from '@/services/hyperliquidService';
import type { LiquidationSnapshot } from '@/services/liquidationsService';

type SnapshotMarketRow = NonNullable<LiquidationSnapshot['top_markets']>[number];

export type TrapSide = 'longs' | 'shorts' | 'balanced';
export type TrapAction = 'Watch' | 'Confirm' | 'Avoid';

export interface TrapDecision {
  symbol: string;
  sideAtRisk: TrapSide;
  action: TrapAction;
  pressureUsd: number | null;
  setupReason: string;
  confirmation: string;
  risk: string;
  priorityScore: number;
  evidence: string;
  fundingRate: number | null;
  priceChangePct: number | null;
  openInterestUsd: number | null;
}

export function buildOverviewTrapDecisions(markets: HyperliquidMarketRow[], limit = 6): TrapDecision[] {
  return markets
    .flatMap((market) => {
      const longPressure = market.estimatedLongLiquidationUsd ?? 0;
      const shortPressure = market.estimatedShortLiquidationUsd ?? 0;

      return [
        buildTrapDecision({
          symbol: market.symbol,
          sideAtRisk: 'longs',
          pressureUsd: longPressure,
          crowdingBias: market.crowdingBias ?? null,
          fundingRate: market.fundingRate ?? null,
          priceChangePct: market.change24hPct ?? null,
          openInterestUsd: market.openInterestUsd ?? null
        }),
        buildTrapDecision({
          symbol: market.symbol,
          sideAtRisk: 'shorts',
          pressureUsd: shortPressure,
          crowdingBias: market.crowdingBias ?? null,
          fundingRate: market.fundingRate ?? null,
          priceChangePct: market.change24hPct ?? null,
          openInterestUsd: market.openInterestUsd ?? null
        })
      ];
    })
    .filter((decision) => decision.pressureUsd !== null && decision.pressureUsd > 0)
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, limit);
}

export function buildSnapshotTrapDecisions(markets: SnapshotMarketRow[], limit = 10): TrapDecision[] {
  return markets
    .map((market) => buildTrapDecision({
      symbol: market.symbol,
      sideAtRisk: normalizeSide(market.bias),
      pressureUsd: market.pressure_usd,
      crowdingBias: market.bias,
      fundingRate: market.funding_rate,
      priceChangePct: market.price_change_pct,
      openInterestUsd: market.open_interest_usd
    }))
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, limit);
}

function buildTrapDecision(input: {
  symbol: string;
  sideAtRisk: TrapSide;
  pressureUsd: number | null;
  crowdingBias: string | null;
  fundingRate: number | null;
  priceChangePct: number | null;
  openInterestUsd: number | null;
}): TrapDecision {
  const pressureUsd = input.pressureUsd;
  const pressureScore = pressureUsd && pressureUsd > 0 ? Math.log10(pressureUsd + 1) * 10 : 0;
  const biasMatches = input.sideAtRisk !== 'balanced' && normalizeSide(input.crowdingBias) === input.sideAtRisk;
  const hasKeyData = pressureUsd !== null && input.fundingRate !== null && input.priceChangePct !== null;
  const fundingSupports = supportsCrowding(input.sideAtRisk, input.fundingRate);
  const moveSupports = supportsMove(input.sideAtRisk, input.priceChangePct);

  let priorityScore = pressureScore;
  if (biasMatches) priorityScore += 20;
  if (fundingSupports) priorityScore += 8;
  if (moveSupports) priorityScore += 8;
  if (!hasKeyData) priorityScore -= 12;
  if (input.sideAtRisk === 'balanced') priorityScore -= 18;

  const action = chooseAction(priorityScore, input.sideAtRisk, pressureUsd);
  const setupReason = buildSetupReason(input.sideAtRisk, pressureUsd, biasMatches, fundingSupports, moveSupports);

  return {
    symbol: input.symbol,
    sideAtRisk: input.sideAtRisk,
    action,
    pressureUsd,
    setupReason,
    confirmation: buildConfirmation(input.sideAtRisk, action),
    risk: buildRisk(input.sideAtRisk, action, hasKeyData),
    priorityScore,
    evidence: buildEvidence(input.sideAtRisk, input.fundingRate, input.priceChangePct, input.openInterestUsd),
    fundingRate: input.fundingRate,
    priceChangePct: input.priceChangePct,
    openInterestUsd: input.openInterestUsd
  };
}

function chooseAction(priorityScore: number, sideAtRisk: TrapSide, pressureUsd: number | null): TrapAction {
  if (sideAtRisk === 'balanced' || !pressureUsd || pressureUsd <= 0) {
    return 'Avoid';
  }
  if (priorityScore >= 88) {
    return 'Confirm';
  }
  if (priorityScore >= 58) {
    return 'Watch';
  }
  return 'Avoid';
}

function normalizeSide(value: string | null | undefined): TrapSide {
  if (value === 'longs' || value === 'longs-at-risk') {
    return 'longs';
  }
  if (value === 'shorts' || value === 'shorts-at-risk') {
    return 'shorts';
  }
  return 'balanced';
}

function supportsCrowding(sideAtRisk: TrapSide, fundingRate: number | null) {
  if (fundingRate === null || Number.isNaN(fundingRate)) return false;
  if (sideAtRisk === 'longs') return fundingRate > 0.00025;
  if (sideAtRisk === 'shorts') return fundingRate < -0.00025;
  return false;
}

function supportsMove(sideAtRisk: TrapSide, priceChangePct: number | null) {
  if (priceChangePct === null || Number.isNaN(priceChangePct)) return false;
  if (sideAtRisk === 'longs') return priceChangePct < -1.5;
  if (sideAtRisk === 'shorts') return priceChangePct > 1.5;
  return false;
}

function buildSetupReason(sideAtRisk: TrapSide, pressureUsd: number | null, biasMatches: boolean, fundingSupports: boolean, moveSupports: boolean) {
  if (sideAtRisk === 'balanced') {
    return 'No clear trapped side; keep as context only.';
  }

  const sideCopy = sideAtRisk === 'longs' ? 'longs vulnerable' : 'shorts vulnerable';
  const evidence = [
    pressureUsd && pressureUsd > 0 ? 'pressure is concentrated' : 'pressure is thin',
    biasMatches ? 'gateway bias agrees' : 'gateway bias is weak',
    fundingSupports ? 'funding supports crowding' : null,
    moveSupports ? 'price move supports stress' : null
  ].filter(Boolean).join(', ');

  return `${sideCopy}: ${evidence}.`;
}

function buildConfirmation(sideAtRisk: TrapSide, action: TrapAction) {
  if (action === 'Avoid' || sideAtRisk === 'balanced') {
    return 'Wait for one side to concentrate before treating this as actionable.';
  }
  if (sideAtRisk === 'longs') {
    return 'Confirm failed bounces, loss of support, and sellers pressing lows.';
  }
  return 'Confirm bid holding, breakout continuation, and offers getting absorbed.';
}

function buildRisk(sideAtRisk: TrapSide, action: TrapAction, hasKeyData: boolean) {
  if (!hasKeyData) {
    return 'Incomplete funding or price context; review raw market state first.';
  }
  if (action === 'Avoid') {
    return 'Weak or balanced trap; forcing a trade risks noise chasing.';
  }
  if (sideAtRisk === 'longs') {
    return 'Bear trap risk if price reclaims support quickly.';
  }
  return 'Failed squeeze risk if breakout stalls and shorts are not forced to cover.';
}

function buildEvidence(sideAtRisk: TrapSide, fundingRate: number | null, priceChangePct: number | null, openInterestUsd: number | null) {
  const side = sideAtRisk === 'longs' ? 'Long risk' : sideAtRisk === 'shorts' ? 'Short risk' : 'Balanced';
  const funding = fundingRate === null || Number.isNaN(fundingRate) ? 'funding N/A' : `funding ${(fundingRate * 100).toFixed(4)}%`;
  const move = priceChangePct === null || Number.isNaN(priceChangePct) ? '24h N/A' : `24h ${priceChangePct >= 0 ? '+' : ''}${priceChangePct.toFixed(2)}%`;
  const oi = openInterestUsd === null || Number.isNaN(openInterestUsd) ? 'OI N/A' : `OI $${formatCompact(openInterestUsd)}`;
  return `${side}; ${funding}; ${move}; ${oi}`;
}

function formatCompact(value: number) {
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toFixed(0);
}
