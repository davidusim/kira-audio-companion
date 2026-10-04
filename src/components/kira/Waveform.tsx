import { useEffect, useRef } from "react";

/** Draws the live waveform straight from the engine's time-domain buffer (no React re-render). */
export function Waveform({ buffer, active, speech }: { buffer: React.RefObject<Float32Array>; active: boolean; speech: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const speechRef = useRef(speech);
  speechRef.current = speech;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const styles = getComputedStyle(canvas);
    let id = 0;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = styles.getPropertyValue("--border");
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
      if (active && buffer.current) {
        const b = buffer.current;
        ctx.strokeStyle = styles.getPropertyValue(speechRef.current ? "--speech" : "--primary");
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const step = Math.max(1, Math.floor(b.length / w));
        for (let x = 0; x < w; x++) {
          const v = b[x * step] ?? 0;
          const y = h / 2 + Math.max(-1, Math.min(1, v * 3)) * (h / 2 - 2);
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      id = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(id);
  }, [active, buffer]);
  return <canvas ref={ref} className="h-20 w-full" aria-label="Live microphone waveform" />;
}
