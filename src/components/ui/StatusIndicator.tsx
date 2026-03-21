interface StatusIndicatorProps {
  status: 'online' | 'offline' | 'loading' | 'warning';
  label?: string;
  showDot?: boolean;
}

export default function StatusIndicator({
  status,
  label,
  showDot = true
}: StatusIndicatorProps) {
  const statusConfig = {
    online: {
      color: 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]',
      text: 'text-emerald-300',
      label: label || 'ONLINE',
    },
    offline: {
      color: 'bg-red-400 shadow-[0_0_8px_rgba(239,68,68,0.8)]',
      text: 'text-red-300',
      label: label || 'OFFLINE',
    },
    loading: {
      color: 'bg-yellow-400 shadow-[0_0_8px_rgba(234,179,8,0.8)]',
      text: 'text-yellow-300',
      label: label || 'LOADING',
    },
    warning: {
      color: 'bg-orange-400 shadow-[0_0_8px_rgba(249,115,22,0.8)]',
      text: 'text-orange-300',
      label: label || 'WARNING',
    },
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center bg-white/5 border border-white/10 px-3 py-1.5 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.15)]">
      {showDot && (
        <div className={`w-2 h-2 rounded-full ${config.color} animate-pulse mr-2`}></div>
      )}
      <div className={`text-[10px] uppercase font-mono tracking-widest ${config.text}`}>
        {config.label}
      </div>
    </div>
  );
}
