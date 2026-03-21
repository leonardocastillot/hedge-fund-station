/**
 * Mini Liquidations Chart - Gráfico compacto para el widget
 */
import { useEffect, useRef } from 'react';

interface DataPoint {
  longs: number;
  shorts: number;
}

interface MiniLiquidationsChartProps {
  data: DataPoint[];
}

export default function MiniLiquidationsChart({ data }: MiniLiquidationsChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || data.length < 2) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const width = canvas.width;
    const height = canvas.height;
    const padding = 2;

    // Calcular escalas
    const maxValue = Math.max(
      ...data.map(d => Math.max(d.longs, d.shorts))
    );

    const xStep = (width - padding * 2) / (data.length - 1);
    const yScale = (height - padding * 2) / maxValue;

    // Dibujar área de longs (rojo)
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);

    data.forEach((point, i) => {
      const x = padding + i * xStep;
      const y = height - padding - point.longs * yScale;
      if (i === 0) {
        ctx.lineTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.lineTo(padding + (data.length - 1) * xStep, height - padding);
    ctx.closePath();

    ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
    ctx.fill();

    ctx.beginPath();
    data.forEach((point, i) => {
      const x = padding + i * xStep;
      const y = height - padding - point.longs * yScale;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.strokeStyle = 'rgb(239, 68, 68)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Dibujar área de shorts (verde)
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);

    data.forEach((point, i) => {
      const x = padding + i * xStep;
      const y = height - padding - point.shorts * yScale;
      if (i === 0) {
        ctx.lineTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.lineTo(padding + (data.length - 1) * xStep, height - padding);
    ctx.closePath();

    ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
    ctx.fill();

    ctx.beginPath();
    data.forEach((point, i) => {
      const x = padding + i * xStep;
      const y = height - padding - point.shorts * yScale;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.strokeStyle = 'rgb(34, 197, 94)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

  }, [data]);

  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center h-20 text-xs text-gray-500">
        Collecting data...
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={280}
      height={80}
      className="w-full"
      style={{ maxHeight: '80px' }}
    />
  );
}
