/**
 * Liquidations Timeline - Timeline visual de eventos importantes
 * Muestra cuándo ocurrieron eventos críticos
 */
import { useLiquidations } from '../contexts/LiquidationsContext';
import { AlertTriangle, Activity } from 'lucide-react';

export default function LiquidationsTimeline() {
  const { recentAlerts } = useLiquidations();

  const formatType = (type: string) => {
    const mapping: Record<string, string> = {
      large_liquidation: 'Liquidacion grande',
      cascade_risk: 'Riesgo de cascada',
      score_shift: 'Cambio de score',
      oi_expansion: 'Expansion de OI',
      price_impulse: 'Impulso de precio',
      funding_shift: 'Cambio de funding',
      crowding: 'Crowding',
      signal_change: 'Cambio de senal',
      side_flip: 'Cambio de lado dominante'
    };
    return mapping[type] || type.replaceAll('_', ' ');
  };

  const getEventIcon = (type: string) => {
    if (type === 'large_liquidation') return <AlertTriangle className="w-4 h-4" />;
    if (type === 'cascade_risk') return <Activity className="w-4 h-4" />;
    return <Activity className="w-4 h-4" />;
  };

  const getEventColor = (severity: string) => {
    if (severity === 'high') return 'text-red-400 border-red-500/30 bg-red-500/10';
    if (severity === 'medium') return 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10';
    return 'text-blue-400 border-blue-500/30 bg-blue-500/10';
  };

  // Últimos 10 eventos
  const events = recentAlerts.slice(0, 10);

  if (events.length === 0) {
    return (
      <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Timeline de Eventos</h3>
        <div className="text-center py-8 text-gray-400">
          <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Aun no hay eventos</p>
          <p className="text-sm mt-1">Los cambios relevantes apareceran aqui</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Timeline de Eventos</h3>

      <div className="relative">
        {/* Vertical Line */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-700" />

        {/* Events */}
        <div className="space-y-4">
          {events.map((event) => (
            <div key={event.id} className="relative flex gap-4">
              {/* Dot */}
              <div className={`relative z-10 flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center ${getEventColor(event.severity)}`}>
                {getEventIcon(event.type)}
              </div>

              {/* Content */}
              <div className="flex-1 pb-4">
                <div className="flex items-start justify-between mb-1">
                  <span className={`text-sm font-medium ${getEventColor(event.severity)}`}>
                    {formatType(event.type)}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>

                <p className="text-sm text-gray-300">{event.message}</p>

                {event.data && (
                  <div className="mt-2 flex gap-4 text-xs text-gray-400">
                    {event.data.total_usd && (
                      <span>Total: ${(event.data.total_usd / 1_000_000).toFixed(1)}M</span>
                    )}
                    {event.data.symbol && (
                      <span>{event.data.symbol}</span>
                    )}
                    {event.data.value && !event.data.total_usd && (
                      <span>Valor: {typeof event.data.value === 'number' ? event.data.value.toFixed(2) : event.data.value}</span>
                    )}
                    {event.data.delta && (
                      <span>Cambio: {typeof event.data.delta === 'number' ? event.data.delta.toFixed(2) : event.data.delta}</span>
                    )}
                    {event.data.ratio && (
                      <span>Ratio: {event.data.ratio.toFixed(2)}</span>
                    )}
                    {event.data.side && (
                      <span className="capitalize">{event.data.side}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
