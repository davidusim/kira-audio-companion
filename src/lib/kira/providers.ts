// Provider abstractions for STT, AI response, and TTS. Browser adapters use only standard APIs.
// Server-backed adapters must call createServerFn endpoints — never put keys in this file.

export type ProviderState = "ready" | "unconfigured" | "unsupported" | "pending-integration" | "error";

export interface ProviderStatus {
  id: string;
  label: string;
  state: ProviderState;
  detail: string;
}

/* ---------- Speech-to-text ---------- */
export interface SttResult {
  text: string;
  final: boolean;
  confidence?: number;
}
export interface SttProvider {
  readonly id: string;
  status(): ProviderStatus;
  start(onResult: (r: SttResult) => void, onError: (msg: string) => void): void;
  stop(): void;
}

type SR = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

function getSR(): (new () => SR) | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}

/** Browser Web Speech API. Note: Chrome sends audio to its own cloud service for recognition. */
export class BrowserSttProvider implements SttProvider {
  readonly id = "browser-web-speech";
  private rec: SR | null = null;
  private active = false;
  status(): ProviderStatus {
    return getSR()
      ? { id: this.id, label: "Browser speech recognition", state: "ready", detail: "Web Speech API available. Audio may be processed by the browser vendor's service." }
      : { id: this.id, label: "Browser speech recognition", state: "unsupported", detail: "This browser has no Web Speech API. Transcripts are unavailable." };
  }
  start(onResult: (r: SttResult) => void, onError: (msg: string) => void) {
    const Ctor = getSR();
    if (!Ctor) return onError("Speech recognition unsupported in this browser.");
    this.active = true;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-US";
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const alternative = r?.[0];
        if (!r || !alternative) continue;
        const confidence = alternative.confidence;
        onResult({ text: alternative.transcript.trim(), final: r.isFinal, ...(confidence ? { confidence } : {}) });
      }
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      onError(`Speech recognition error: ${e.error}`);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") this.active = false;
    };
    rec.onend = () => {
      if (this.active) {
        try { rec.start(); } catch { /* already started */ }
      }
    };
    try { rec.start(); } catch (err) { onError((err as Error).message); }
    this.rec = rec;
  }
  stop() {
    this.active = false;
    try { this.rec?.stop(); } catch { /* ignore */ }
    this.rec = null;
  }
}

/* ---------- AI response ---------- */
export interface AiProvider {
  readonly id: string;
  status(): ProviderStatus;
  respond(input: { transcript: string; history: { role: "user" | "assistant"; text: string }[] }, signal: AbortSignal): Promise<string>;
}

/** Placeholder until a server-backed model adapter is wired in. Reports honestly. */
export class UnconfiguredAiProvider implements AiProvider {
  readonly id = "ai-unconfigured";
  constructor(private serverStatus?: ProviderStatus) {}
  status(): ProviderStatus {
    return this.serverStatus ?? { id: this.id, label: "AI response", state: "unconfigured", detail: "No AI provider connected yet." };
  }
  async respond(_input: { transcript: string; history: { role: "user" | "assistant"; text: string }[] }, _signal: AbortSignal): Promise<string> {
    throw new Error("AI provider is not configured.");
  }
}

/* ---------- Text-to-speech ---------- */
export interface TtsProvider {
  readonly id: string;
  status(): ProviderStatus;
  voices(): { uri: string; name: string; lang: string }[];
  speak(text: string, opts: { voiceURI?: string; volume: number }, onEnd: () => void): void;
  stop(): void;
}

export class BrowserTtsProvider implements TtsProvider {
  readonly id = "browser-speech-synthesis";
  private get synth() {
    return typeof window !== "undefined" ? window.speechSynthesis : undefined;
  }
  status(): ProviderStatus {
    return this.synth
      ? { id: this.id, label: "Browser voice", state: "ready", detail: "Speech Synthesis API available (on-device or OS voices)." }
      : { id: this.id, label: "Browser voice", state: "unsupported", detail: "Speech Synthesis API unavailable." };
  }
  voices() {
    return (this.synth?.getVoices() ?? []).map((v) => ({ uri: v.voiceURI, name: v.name, lang: v.lang }));
  }
  speak(text: string, opts: { voiceURI?: string; volume: number }, onEnd: () => void) {
    const s = this.synth;
    if (!s) return onEnd();
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.volume = opts.volume;
    const v = s.getVoices().find((x) => x.voiceURI === opts.voiceURI);
    if (v) u.voice = v;
    u.onend = onEnd;
    u.onerror = onEnd;
    s.speak(u);
  }
  stop() {
    this.synth?.cancel();
  }
}
