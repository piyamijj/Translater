'use client';

import { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  analyserNode: AnalyserNode | null;
  isActive: boolean;
  className?: string;
}

/**
 * Live waveform visualizer driven by a Web Audio AnalyserNode. Renders a
 * center-mirrored bar waveform on a <canvas>, redrawn every animation frame
 * while recording is active.
 */
export function AudioVisualizer({ analyserNode, isActive, className }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const resize = () => {
      const { clientWidth, clientHeight } = canvas;
      canvas.width = clientWidth * dpr;
      canvas.height = clientHeight * dpr;
    };
    resize();
    window.addEventListener('resize', resize);

    if (!analyserNode || !isActive) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return () => window.removeEventListener('resize', resize);
    }

    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      analyserNode.getByteTimeDomainData(dataArray);
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      const barCount = 48;
      const step = Math.floor(bufferLength / barCount);
      const barWidth = width / barCount;
      const centerY = height / 2;

      for (let i = 0; i < barCount; i++) {
        const sampleIndex = i * step;
        const v = (dataArray[sampleIndex] - 128) / 128; // -1..1
        const barHeight = Math.max(2 * dpr, Math.abs(v) * height * 0.9);

        const gradient = ctx.createLinearGradient(0, centerY - barHeight / 2, 0, centerY + barHeight / 2);
        gradient.addColorStop(0, 'rgba(129, 140, 248, 0.9)'); // indigo-400
        gradient.addColorStop(1, 'rgba(56, 189, 248, 0.9)'); // sky-400
        ctx.fillStyle = gradient;

        const x = i * barWidth + barWidth * 0.2;
        const w = barWidth * 0.6;
        const radius = Math.min(w / 2, 4 * dpr);
        const y = centerY - barHeight / 2;
        ctx.beginPath();
        ctx.roundRect?.(x, y, w, barHeight, radius) ?? ctx.rect(x, y, w, barHeight);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [analyserNode, isActive]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: '100%', height: '100%' }}
      aria-hidden="true"
    />
  );
}
