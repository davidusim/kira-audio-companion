// Shared domain types for Kira Ears.

export type EngineState =
  | "idle"
  | "requesting"
  | "listening"
  | "speech"
  | "processing"
  | "responding"
  | "muted"
  | "error";

export type PermissionValue = "unknown" | "prompt" | "granted" | "denied" | "unsupported";

export type EventType =
  | "state"
  | "vad"
  | "transcript"
  | "ambient"
  | "response"
  | "error"
  | "system";

export type EventSource = "mic" | "vad" | "stt" | "ai" | "tts" | "classifier" | "system";

export interface FeedEvent {
  id: string;
  t: number; // epoch ms
  type: EventType;
  source: EventSource;
  text: string;
  /** Session-local speaker label (e.g. "Speaker 1"). Never a real identity. */
  speakerLabel?: string;
  confidence?: number;
  meta?: Record<string, string | number | boolean>;
}

export interface Session {
  id: string;
  startedAt: number;
  endedAt?: number;
  events: FeedEvent[];
}

export type ErrorCode =
  | "permission-denied"
  | "no-device"
  | "unsupported"
  | "device-disconnected"
  | "device-busy"
  | "provider"
  | "network"
  | "unknown";

export interface KiraError {
  id: string;
  t: number;
  code: ErrorCode;
  message: string;
  recoverable: boolean;
}

export interface SignalMetrics {
  rms: number; // 0..1
  db: number; // dBFS
  peak: number;
  zcr: number; // zero-crossing rate 0..1
  centroidHz: number;
  speechBandRatio: number; // energy share in 300–3400 Hz
  noiseFloor: number;
  threshold: number;
  isSpeech: boolean;
}

export const EMPTY_METRICS: SignalMetrics = {
  rms: 0,
  db: -100,
  peak: 0,
  zcr: 0,
  centroidHz: 0,
  speechBandRatio: 0,
  noiseFloor: 0,
  threshold: 0,
  isSpeech: false,
};

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
