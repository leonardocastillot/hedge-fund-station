import { ReactNode } from 'react';

interface GlassPanelProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  glow?: 'blue' | 'cyan' | 'green' | 'red' | 'purple';
}

export default function GlassPanel({
  children,
  className = '',
  hover = false,
  glow = 'blue'
}: GlassPanelProps) {
  const glowColors = {
    blue: 'bg-blue-500/10 group-hover:bg-blue-500/20',
    cyan: 'bg-cyan-500/10 group-hover:bg-cyan-500/20',
    green: 'bg-emerald-500/10 group-hover:bg-emerald-500/20',
    red: 'bg-red-500/10 group-hover:bg-red-500/20',
    purple: 'bg-purple-500/10 group-hover:bg-purple-500/20',
  };

  return (
    <div className={`glass-panel p-6 shadow-xl relative overflow-hidden ${hover ? 'group' : ''} ${className}`}>
      {hover && (
        <div className={`absolute top-0 right-0 w-32 h-32 ${glowColors[glow]} rounded-full blur-3xl transition-all duration-700`}></div>
      )}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
