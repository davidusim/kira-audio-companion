// Signal features + energy/spectral voice activity detection with adaptive noise floor.
// This is a heuristic VAD (no ML). It distinguishes "speech-like" sound from silence/steady noise.
// Swap in an ML VAD by implementing VoiceActivityDetector.
import type { SignalMetrics } from "./types";

export interface FrameFeatures {
  rms: number;
  peak: number;
  zcr: number;
  centroidHz: number;
  speechBandRatio: number;
}

export function computeFeatures(time: Float32Array, freqDb: Float32Array, sampleRate: number): FrameFeatures {
  let sum = 0, peak = 0, zc = 0;
  for (let i = 0; i < time.length; i++) {
    const v = time[i] ?? 0;
    sum += v * v;
    const a = Math.abs(v);
    if (a > peak) peak = a;
    if (i > 0 && (v >= 0) !== ((time[i - 1] ?? 0) >= 0)) zc++;
  }
  const rms = time.length > 0 ? Math.sqrt(sum / time.length) : 0;
  const binHz = sampleRate / 2 / freqDb.length;
  let total = 0, band = 0, weighted = 0;
  for (let i = 1; i < freqDb.length; i++) {
    const mag = Math.pow(10, (freqDb[i] ?? -Infinity) / 20);
    const hz = i * binHz;
    total += mag;
    weighted += mag * hz;
    if (hz >= 300 && hz <= 3400) band += mag;
  }
  return {
    rms,
    peak,
    zcr: zc / time.length,
    centroidHz: total > 0 ? weighted / total : 0,
    speechBandRatio: total > 0 ? band / total : 0,
  };
}

export interface VoiceActivityDetector {
  readonly id: string;
  update(f: FrameFeatures, now: number): Pick<SignalMetrics, "isSpeech" | "noiseFloor" | "threshold">;
  setSensitivity(s: number): void;
  reset(): void;
}

/** Adaptive energy + speech-band VAD with onset frames and hangover. */
export class HeuristicVad implements VoiceActivityDetector {
  readonly id = "heuristic-energy-spectral";
  private floor = 0.004;
  private sensitivity = 0.6; // 0..1, higher = triggers more easily
  private onsetCount = 0;
  private lastVoiceAt = 0;
  private speaking = false;
  private readonly onsetFrames = 3;
  private readonly hangoverMs = 450;

  setSensitivity(s: number) {
    this.sensitivity = Math.min(1, Math.max(0, s));
  }

  reset() {
    this.floor = 0.004;
    this.onsetCount = 0;
    this.speaking = false;
  }

  update(f: FrameFeatures, now: number) {
    // Threshold multiplier: sensitivity 1 → 1.6x floor, 0 → 6x floor.
    const mult = 6 - this.sensitivity * 4.4;
    const threshold = Math.max(this.floor * mult, 0.006 + (1 - this.sensitivity) * 0.01);
    const speechLike = f.rms > threshold && f.speechBandRatio > 0.35 && f.zcr < 0.35;

    if (speechLike) {
      this.onsetCount++;
      if (this.onsetCount >= this.onsetFrames) {
        this.speaking = true;
        this.lastVoiceAt = now;
      }
    } else {
      this.onsetCount = 0;
      if (this.speaking && now - this.lastVoiceAt > this.hangoverMs) this.speaking = false;
      // Adapt floor only on non-speech frames; faster down than up.
      const rate = f.rms < this.floor ? 0.05 : 0.004;
      this.floor = Math.max(0.0005, this.floor + (f.rms - this.floor) * rate);
    }
    return { isSpeech: this.speaking, noiseFloor: this.floor, threshold };
  }
}

export const toDb = (rms: number) => (rms > 0 ? Math.max(-100, 20 * Math.log10(rms)) : -100);
