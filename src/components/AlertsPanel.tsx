/**
 * Alerts Panel - Panel persistente de alertas de liquidaciones
 * Historial completo de alertas para no perder ninguna
 */
import { useState, useEffect } from 'react';
import { AlertTriangle, Bell, Trash2, X, Volume2, VolumeX } from 'lucide-react';
import { useLiquidations } from '../contexts/LiquidationsContext';
import type { LiquidationAlert } from '../services/liquidationsService';

export default function AlertsPanel() {
  const { recentAlerts } = useLiquidations();
  const [allAlerts, setAllAlerts] = useState<LiquidationAlert[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  // Sonido de alerta
  const playAlertSound = () => {
    if (!soundEnabled) return;

    // Crear beep corto
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  };

  // Agregar nuevas alertas
  useEffect(() => {
    if (recentAlerts.length > 0) {
      const newAlert = recentAlerts[0];

      // Verificar si ya existe
      if (!allAlerts.find(a => a.id === newAlert.id)) {
        setAllAlerts(prev => [newAlert, ...prev]);
        setUnreadCount(prev => prev + 1);

        // Reproducir sonido
        playAlertSound();

        // Auto-abrir panel si está cerrado
        if (!isOpen) {
          setIsOpen(true);
          // Auto-cerrar después de 10 segundos
          setTimeout(() => {
            setIsOpen(false);
          }, 10000);
        }
      }
    }
  }, [recentAlerts]);

  const clearAlerts = () => {
    setAllAlerts([]);
    setUnreadCount(0);
  };

  const removeAlert = (id: number) => {
    setAllAlerts(prev => prev.filter(a => a.id !== id));
  };

  const markAllRead = () => {
    setUnreadCount(0);
  };

  const getSeverityColor = (severity: string) => {
    if (severity === 'high') return 'bg-red-500/20 border-red-500/30 text-red-400';
    if (severity === 'medium') return 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400';
    return 'bg-blue-500/20 border-blue-500/30 text-blue-400';
  };

  const getSeverityIcon = (severity: string) => {
    if (severity === 'high') return '🚨';
    if (severity === 'medium') return '⚠️';
    return 'ℹ️';
  };

  return (
    <>
      {/* Floating Alert Button */}
      <div className="fixed bottom-20 right-4 z-50">
        <button
          onClick={() => {
            setIsOpen(!isOpen);
            if (!isOpen) markAllRead();
          }}
          className={`relative p-4 rounded-full shadow-lg transition-all ${
            unreadCount > 0
              ? 'bg-red-600 hover:bg-red-700 animate-pulse'
              : 'bg-purple-600 hover:bg-purple-700'
          }`}
        >
          <Bell className="w-6 h-6 text-white" />
          {unreadCount > 0 && (
            <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center animate-bounce">
              {unreadCount}
            </div>
          )}
        </button>
      </div>

      {/* Alerts Panel */}
      {isOpen && (
        <div className="fixed bottom-36 right-4 z-50 w-96 max-h-[500px] bg-gray-900/95 backdrop-blur-md border border-purple-500/30 rounded-xl shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-purple-400" />
              <h3 className="font-bold text-white">Liquidation Alerts</h3>
              <span className="text-xs text-gray-400">({allAlerts.length})</span>
            </div>

            <div className="flex items-center gap-2">
              {/* Sound Toggle */}
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                title={soundEnabled ? 'Disable sound' : 'Enable sound'}
              >
                {soundEnabled ? (
                  <Volume2 className="w-4 h-4 text-green-400" />
                ) : (
                  <VolumeX className="w-4 h-4 text-gray-400" />
                )}
              </button>

              {/* Clear All */}
              {allAlerts.length > 0 && (
                <button
                  onClick={clearAlerts}
                  className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                  title="Clear all alerts"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              )}

              {/* Close */}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 hover:bg-gray-700 rounded transition-colors"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Alerts List */}
          <div className="overflow-y-auto max-h-[400px] p-2">
            {allAlerts.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No alerts yet</p>
                <p className="text-sm mt-1">You'll be notified of important events</p>
              </div>
            ) : (
              <div className="space-y-2">
                {allAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`border rounded-lg p-3 ${getSeverityColor(alert.severity)}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{getSeverityIcon(alert.severity)}</span>
                        <span className="text-xs font-medium uppercase">{alert.severity}</span>
                      </div>

                      <button
                        onClick={() => removeAlert(alert.id)}
                        className="p-1 hover:bg-black/20 rounded transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="mb-2">
                      <p className="text-sm font-medium">{alert.message}</p>
                    </div>

                    <div className="flex items-center justify-between text-xs opacity-70">
                      <span>{new Date(alert.timestamp).toLocaleTimeString()}</span>
                      <span className="uppercase">{alert.type}</span>
                    </div>

                    {/* Additional Data */}
                    {alert.data && (
                      <div className="mt-2 pt-2 border-t border-current/20 text-xs space-y-1">
                        {alert.data.total_usd && (
                          <div className="flex justify-between">
                            <span>Total:</span>
                            <span className="font-medium">
                              ${(alert.data.total_usd / 1_000_000).toFixed(1)}M
                            </span>
                          </div>
                        )}
                        {alert.data.ratio && (
                          <div className="flex justify-between">
                            <span>Ratio:</span>
                            <span className="font-medium">{alert.data.ratio.toFixed(2)}</span>
                          </div>
                        )}
                        {alert.data.side && (
                          <div className="flex justify-between">
                            <span>Side:</span>
                            <span className="font-medium uppercase">{alert.data.side}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-gray-700 text-center">
            <a
              href="/liquidations"
              className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
            >
              View Full History →
            </a>
          </div>
        </div>
      )}
    </>
  );
}
