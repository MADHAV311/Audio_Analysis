/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';

interface LiveSpectrogramProps {
  analyser: AnalyserNode | null;
  color: string;
  label: string;
  sampleRate?: number; // The sample rate we want to simulate/display (e.g. 8000)
  contextSampleRate?: number; // The actual sample rate of the AudioContext (e.g. 16000)
}

export const LiveSpectrogram: React.FC<LiveSpectrogramProps> = ({ 
  analyser, 
  color, 
  label, 
  sampleRate = 16000,
  contextSampleRate = 16000
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  const dataArrayRef = useRef<Uint8Array>();
  const tempCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));

  useEffect(() => {
    if (!analyser || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    dataArrayRef.current = new Uint8Array(bufferLength);

    // Calculate how many bins to actually show based on the target sample rate
    // If context is 16kHz (Nyquist 8kHz) and target is 8kHz (Nyquist 4kHz),
    // we only show the first 50% of bins.
    const nyquistContext = contextSampleRate / 2;
    const nyquistTarget = sampleRate / 2;
    const binsToShow = Math.floor((nyquistTarget / nyquistContext) * bufferLength);

    // Setup temp canvas for scrolling
    const tempCanvas = tempCanvasRef.current;
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');

    const draw = () => {
      if (!analyser || !ctx || !tempCtx) return;

      analyser.getByteFrequencyData(dataArrayRef.current!);

      // Scroll existing content to the left
      tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
      tempCtx.drawImage(canvas, -1, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(tempCanvas, 0, 0);

      // Draw new column
      const barHeight = canvas.height / binsToShow;
      for (let i = 0; i < binsToShow; i++) {
        const value = dataArrayRef.current![i];
        const percent = value / 255;
        const hue = (percent * 120) + 200; // Blue to Green/Yellow
        ctx.fillStyle = percent > 0.1 ? `hsla(${hue}, 100%, 50%, ${percent})` : 'transparent';
        // Draw from bottom up, but only up to binsToShow
        ctx.fillRect(canvas.width - 1, canvas.height - (i * barHeight), 1, barHeight);
      }

      requestRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [analyser, sampleRate, contextSampleRate]);

  return (
    <div className="relative w-full h-32 bg-black rounded-lg overflow-hidden border border-neutral-800">
      <canvas
        ref={canvasRef}
        width={600}
        height={128}
        className="w-full h-full"
      />
      <div className="absolute top-2 left-2 flex gap-2">
        <div className="px-2 py-0.5 bg-black/50 backdrop-blur-md rounded text-[10px] font-mono uppercase tracking-widest text-white/70 border border-white/10">
          {label}
        </div>
        <div className="px-2 py-0.5 bg-indigo-500/20 backdrop-blur-md rounded text-[10px] font-mono uppercase tracking-widest text-indigo-400 border border-indigo-500/20">
          {sampleRate / 1000}kHz
        </div>
      </div>
    </div>
  );
};
