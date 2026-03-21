interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
}

export default function LoadingSpinner({ size = 'md', text = 'Loading...' }: LoadingSpinnerProps) {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  return (
    <div className="flex flex-col items-center justify-center">
      <div className={`${sizes[size]} rounded-full border-2 border-cyan-500 border-t-transparent animate-spin mb-4 shadow-[0_0_15px_rgba(0,243,255,0.5)]`}></div>
      {text && (
        <div className="text-cyan-400/70 font-mono text-sm tracking-widest uppercase animate-pulse">
          {text}
        </div>
      )}
    </div>
  );
}
