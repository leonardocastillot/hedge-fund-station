export interface StrategyDraft {
  id: string;
  name: string;
  status: 'ready_for_backtest' | 'research';
  objective: string;
  thesis: string;
  market: string;
  direction: 'LONG' | 'SHORT' | 'BOTH';
  primaryTimeframe: string;
  executionTimeframe: string;
  holdingWindow: string;
  expectedProfile: {
    target: string;
    drawdownGuard: string;
    frequency: string;
  };
  indicators: string[];
  entryRules: string[];
  exitRules: string[];
  riskRules: string[];
  backtestPlan: string[];
  notes: string[];
}

export const strategyDrafts: StrategyDraft[] = [
  {
    id: 'crypto-regime-pullback-v1',
    name: 'Crypto_Regime_Pullback_v1',
    status: 'ready_for_backtest',
    objective: 'Capturar continuidad alcista en crypto sin quedarse expuesto durante fases de bear o chop agresivo.',
    thesis: 'La mejor primera ventaja durable en crypto no es microestructura frágil sino tendencia con filtro de régimen y sizing por volatilidad. Entra solo cuando el mercado ya confirmó estructura alcista y compra pullbacks controlados, para bajar drawdown respecto a perseguir breakouts.',
    market: 'BTC y ETH spot o perpetuals líquidos en exchange crypto',
    direction: 'LONG',
    primaryTimeframe: '4h',
    executionTimeframe: '1h',
    holdingWindow: '1 a 8 días',
    expectedProfile: {
      target: 'Retorno compuesto con exposición selectiva, no máximo upside bruto',
      drawdownGuard: 'Salir a cash en régimen débil y usar stop basado en ATR',
      frequency: 'Baja a media frecuencia, pocas operaciones pero más limpias'
    },
    indicators: ['SMA 50', 'SMA 200', 'EMA 9', 'EMA 21', 'RSI 14', 'MACD histogram', 'Stoch K/D', 'ATR'],
    entryRules: [
      'Régimen activo solo si el cierre está sobre SMA 200 y SMA 50 está sobre SMA 200.',
      'Momentum confirmado solo si EMA 9 > EMA 21 y MACD histogram > 0.',
      'No perseguir extensión: RSI 14 debe estar entre 52 y 68 al momento de entrada.',
      'Entrada en pullback: el precio debe volver cerca de EMA 21 o SMA 20 equivalente y luego Stoch K cruza sobre Stoch D por debajo de 55.',
      'Filtro de ruido: ATR/close debe estar entre 1.0% y 4.5%; si está más alto se evita la entrada.'
    ],
    exitRules: [
      'Stop inicial a 1.8 ATR bajo la entrada.',
      'Invalidación temprana si cierre 4h cae bajo EMA 21 y MACD histogram pasa a negativo.',
      'Take-profit defensivo si RSI 14 supera 76 y el precio queda demasiado extendido sobre EMA 21.',
      'Trailing stop una vez que la operación avanza al menos +1 ATR a favor.'
    ],
    riskRules: [
      'Riesgo por trade: 0.35% a 0.50% del capital.',
      'Máximo una posición por activo; no apilar entradas en la misma dirección.',
      'Si hay stop-loss, aplicar cooldown de 3 velas de 4h antes de reentrar.',
      'Si el activo pierde SMA 200, cerrar todo y quedar en cash.'
    ],
    backtestPlan: [
      'Primera pasada en 4h con 3 años para comparar rápido contra el resto del libro.',
      'Segunda pasada full history en BTC y ETH por separado.',
      'Evaluar walk-forward por régimen: bull, bear, chop lateral, eventos extremos.',
      'Aprobar solo si max drawdown queda claramente bajo 20% y Sharpe supera 1.2 con suficiente número de trades.'
    ],
    notes: [
      'Pensada para robustez y control de drawdown, no para HFT ni edge de latencia.',
      'Encaja bien con los indicadores que ya aparecen en el stack actual.',
      'Si luego se quiere ampliar, la versión v2 puede añadir sizing por volatilidad objetivo.'
    ]
  }
];

export function formatStrategyDraftForClipboard(draft: StrategyDraft): string {
  return [
    `Strategy: ${draft.name}`,
    `Status: ${draft.status}`,
    `Objective: ${draft.objective}`,
    `Thesis: ${draft.thesis}`,
    `Market: ${draft.market}`,
    `Direction: ${draft.direction}`,
    `Primary timeframe: ${draft.primaryTimeframe}`,
    `Execution timeframe: ${draft.executionTimeframe}`,
    `Holding window: ${draft.holdingWindow}`,
    '',
    'Expected profile:',
    `- Target: ${draft.expectedProfile.target}`,
    `- Drawdown guard: ${draft.expectedProfile.drawdownGuard}`,
    `- Frequency: ${draft.expectedProfile.frequency}`,
    '',
    'Indicators:',
    ...draft.indicators.map((indicator) => `- ${indicator}`),
    '',
    'Entry rules:',
    ...draft.entryRules.map((rule) => `- ${rule}`),
    '',
    'Exit rules:',
    ...draft.exitRules.map((rule) => `- ${rule}`),
    '',
    'Risk rules:',
    ...draft.riskRules.map((rule) => `- ${rule}`),
    '',
    'Backtest plan:',
    ...draft.backtestPlan.map((step) => `- ${step}`),
    '',
    'Notes:',
    ...draft.notes.map((note) => `- ${note}`)
  ].join('\n');
}
