// Microphone capture via getUserMedia + Web Audio. Browser-only; instantiate in effects/handlers.
import type { ErrorCode } from "./types";

export class CaptureError extends Error {
  constructor(public code: ErrorCode, message: string) {
    super(message);
  }
}

export function isCaptureSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window !== "undefined" &&
    !!(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext)
  );
}

export function mapGetUserMediaError(err: unknown): CaptureError {
  const name = (err as { name?: string })?.name;
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return new CaptureError("permission-denied", "Microphone permission was denied. Allow it in your browser's site settings, then try again.");
    case "NotFoundError":
    case "OverconstrainedError":
      return new CaptureError("no-device", "No microphone was found. Connect one and try again.");
    case "NotReadableError":
    case "AbortError":
      return new CaptureError("device-busy", "The microphone is in use by another app or failed to start.");
    default:
      return new CaptureError("unknown", (err as Error)?.message || "Could not start the microphone.");
  }
}

export interface CaptureOptions {
  deviceId?: string;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  fftSize?: number;
}

export class MicCapture {
  stream: MediaStream | null = null;
  ctx: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  onEnded?: () => void;

  async start(opts: CaptureOptions) {
    if (!isCaptureSupported()) throw new CaptureError("unsupported", "This browser does not support microphone capture (requires HTTPS and MediaDevices).");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(opts.deviceId ? { deviceId: { exact: opts.deviceId } } : {}),
          noiseSuppression: opts.noiseSuppression,
          echoCancellation: opts.echoCancellation,
          autoGainControl: opts.autoGainControl,
        },
      });
    } catch (e) {
      throw mapGetUserMediaError(e);
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = opts.fftSize ?? 2048;
    this.analyser.smoothingTimeConstant = 0.6;
    this.source.connect(this.analyser);
    this.stream.getAudioTracks().forEach((t) => t.addEventListener("ended", () => this.onEnded?.()));
  }

  setMuted(muted: boolean) {
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }

  get track(): MediaStreamTrack | undefined {
    return this.stream?.getAudioTracks()[0];
  }

  get sampleRate(): number | undefined {
    return this.ctx?.sampleRate;
  }

  async stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.source?.disconnect();
    if (this.ctx && this.ctx.state !== "closed") await this.ctx.close().catch(() => {});
    this.stream = null;
    this.ctx = null;
    this.analyser = null;
    this.source = null;
  }
}

export async function listInputDevices(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === "audioinput");
}

export async function queryMicPermission(): Promise<"prompt" | "granted" | "denied" | "unknown"> {
  try {
    const s = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return s.state;
  } catch {
    return "unknown"; // Safari/Firefox may not support querying microphone permission
  }
}
