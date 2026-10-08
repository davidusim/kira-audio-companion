// Orchestrates capture → analysis/VAD → STT → AI → TTS and records real state transitions.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MicCapture, CaptureError, isCaptureSupported, listInputDevices, queryMicPermission } from "@/lib/kira/audio-capture";
import { HeuristicVad, computeFeatures, toDb } from "@/lib/kira/analysis";
import { ambientClassifiers } from "@/lib/kira/classifiers";
import { BrowserSttProvider, BrowserTtsProvider, UnconfiguredAiProvider, type ProviderStatus } from "@/lib/kira/providers";
import { sessionStore } from "@/lib/kira/session-store";
import type { KiraSettings } from "@/lib/kira/settings";
import { EMPTY_METRICS, uid, type EngineState, type KiraError, type PermissionValue, type SignalMetrics } from "@/lib/kira/types";

export function useKiraEngine(settings: KiraSettings, serverAi?: ProviderStatus) {
  const [state, setStateRaw] = useState<EngineState>("idle");
  const [permission, setPermission] = useState<PermissionValue>("unknown");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [metrics, setMetrics] = useState<SignalMetrics>(EMPTY_METRICS);
  const [errors, setErrors] = useState<KiraError[]>([]);
  const [interim, setInterim] = useState("");
  const [sampleRate, setSampleRate] = useState<number>();
  const [activeDevice, setActiveDevice] = useState<string>();
  const [supported, setSupported] = useState(true);
  const [providersReady, setProvidersReady] = useState(false);

  const stateRef = useRef<EngineState>("idle");
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const capture = useRef<MicCapture | null>(null);
  const vad = useRef(new HeuristicVad());
  const timeBuf = useRef<Float32Array>(new Float32Array(2048));
  const freqBuf = useRef<Float32Array>(new Float32Array(1024));
  const raf = useRef<number>(0);
  const lastUi = useRef(0);
  const prevSpeech = useRef(false);
  const speechStart = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const stt = useMemo(() => new BrowserSttProvider(), []);
  const tts = useMemo(() => new BrowserTtsProvider(), []);
  const ai = useMemo(() => new UnconfiguredAiProvider(serverAi), [serverAi]);

  const log = sessionStore.add.bind(sessionStore);

  const setState = useCallback((next: EngineState, reason?: string) => {
    if (stateRef.current === next) return;
    const prev = stateRef.current;
    stateRef.current = next;
    setStateRaw(next);
    if (settingsRef.current.logVadEvents || (next !== "speech" && prev !== "speech")) {
      log({ type: "state", source: "system", text: `${prev} → ${next}${reason ? ` · ${reason}` : ""}` });
    }
  }, [log]);

  const pushError = useCallback((code: KiraError["code"], message: string, recoverable = true) => {
    setErrors((e) => [{ id: uid(), t: Date.now(), code, message, recoverable }, ...e].slice(0, 25));
    log({ type: "error", source: code === "provider" || code === "network" ? "ai" : "mic", text: message, meta: { code } });
  }, [log]);

  const refreshDevices = useCallback(async () => {
    try { setDevices(await listInputDevices()); } catch { /* ignore */ }
  }, []);

  // Initial capability + permission probe
  useEffect(() => {
    setProvidersReady(true);
    sessionStore.hydrate();
    const ok = isCaptureSupported();
    setSupported(ok);
    if (!ok) { setPermission("unsupported"); return; }
    queryMicPermission().then((p) => setPermission(p));
    refreshDevices();
    const onChange = () => refreshDevices();
    navigator.mediaDevices.addEventListener?.("devicechange", onChange);
    return () => navigator.mediaDevices.removeEventListener?.("devicechange", onChange);
  }, [refreshDevices]);

  useEffect(() => vad.current.setSensitivity(settings.sensitivity), [settings.sensitivity]);

  const handleTranscript = useCallback(async (text: string, confidence?: number) => {
    log({ type: "transcript", source: "stt", text, ...(confidence === undefined ? {} : { confidence }) });
    const status = ai.status();
    if (status.state !== "ready") {
      log({ type: "system", source: "ai", text: `No response generated — ${status.label}: ${status.state}.` });
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setState("processing", "sending transcript to AI");
    try {
      const reply = await ai.respond({ transcript: text, history: [] }, ac.signal);
      log({ type: "response", source: "ai", text: reply });
      if (settingsRef.current.voiceEnabled) {
        setState("responding", "speaking");
        tts.speak(reply, { voiceURI: settingsRef.current.voiceURI, volume: settingsRef.current.voiceVolume }, () => {
          if (stateRef.current === "responding") setState(capture.current ? "listening" : "idle", "response finished");
        });
      } else setState(capture.current ? "listening" : "idle");
    } catch (e) {
      if (!ac.signal.aborted) pushError("provider", (e as Error).message);
      setState(capture.current ? "listening" : "idle");
    }
  }, [ai, log, pushError, setState, tts]);

  const loop = useCallback(() => {
    const c = capture.current;
    if (!c?.analyser || !c.ctx) return;
    const an = c.analyser;
    if (timeBuf.current.length !== an.fftSize) timeBuf.current = new Float32Array(an.fftSize);
    if (freqBuf.current.length !== an.frequencyBinCount) freqBuf.current = new Float32Array(an.frequencyBinCount);
    an.getFloatTimeDomainData(timeBuf.current as Float32Array<ArrayBuffer>);
    an.getFloatFrequencyData(freqBuf.current as Float32Array<ArrayBuffer>);
    const f = computeFeatures(timeBuf.current, freqBuf.current, c.ctx.sampleRate);
    const now = performance.now();
    const v = vad.current.update(f, now);
    const s = stateRef.current;

    if (s !== "muted" && s !== "processing" && s !== "responding") {
      if (v.isSpeech && !prevSpeech.current) {
        speechStart.current = Date.now();
        setState("speech", "VAD onset");
        if (settingsRef.current.logVadEvents)
          log({ type: "vad", source: "vad", text: "Speech-like audio detected", meta: { db: Math.round(toDb(f.rms)) } });
      } else if (!v.isSpeech && prevSpeech.current) {
        const dur = Date.now() - speechStart.current;
        setState("listening", "VAD hangover elapsed");
        if (settingsRef.current.logVadEvents)
          log({ type: "vad", source: "vad", text: `Speech segment ended (${(dur / 1000).toFixed(1)}s)`, meta: { durationMs: dur } });
      }
    }
    prevSpeech.current = v.isSpeech;

    if (ambientClassifiers.length) {
      // Extension point: classifiers would run here at their own cadence.
    }

    if (now - lastUi.current > 66) {
      lastUi.current = now;
      setMetrics({ ...f, db: toDb(f.rms), ...v });
    }
    raf.current = requestAnimationFrame(loop);
  }, [log, setState]);

  const stop = useCallback(async (reason = "user stopped") => {
    cancelAnimationFrame(raf.current);
    stt.stop();
    tts.stop();
    abortRef.current?.abort();
    await capture.current?.stop();
    capture.current = null;
    prevSpeech.current = false;
    vad.current.reset();
    setMetrics(EMPTY_METRICS);
    setInterim("");
    setSampleRate(undefined);
    setActiveDevice(undefined);
    if (stateRef.current !== "error") setState("idle", reason);
    sessionStore.endSession();
  }, [setState, stt, tts]);

  const start = useCallback(async () => {
    if (capture.current) return;
    const s = settingsRef.current;
    sessionStore.startSession();
    setState("requesting", "asking for microphone");
    const c = new MicCapture();
    try {
      await c.start({ ...(s.deviceId ? { deviceId: s.deviceId } : {}), noiseSuppression: s.noiseSuppression, echoCancellation: s.echoCancellation, autoGainControl: s.autoGainControl });
    } catch (e) {
      const err = e instanceof CaptureError ? e : new CaptureError("unknown", String(e));
      if (err.code === "permission-denied") setPermission("denied");
      pushError(err.code, err.message);
      setState("error", err.code);
      sessionStore.endSession();
      return;
    }
    capture.current = c;
    setPermission("granted");
    setSampleRate(c.sampleRate);
    setActiveDevice(c.track?.label || "Default microphone");
    refreshDevices();
    c.onEnded = () => {
      pushError("device-disconnected", "The microphone was disconnected or stopped by the system.");
      stateRef.current = "error";
      setStateRaw("error");
      void stop("device ended");
    };
    log({ type: "system", source: "mic", text: `Microphone active: ${c.track?.label || "default"} @ ${c.sampleRate} Hz` });
    setState("listening", "capture started");
    raf.current = requestAnimationFrame(loop);

    if (s.sttEnabled && stt.status().state === "ready") {
      stt.start(
        (r) => {
          if (r.final) { setInterim(""); if (r.text) void handleTranscript(r.text, r.confidence); }
          else setInterim(r.text);
        },
        (msg) => pushError("provider", msg),
      );
    }
  }, [handleTranscript, log, loop, pushError, refreshDevices, setState, stop, stt]);

  const toggleMute = useCallback(() => {
    const c = capture.current;
    if (!c) return;
    if (stateRef.current === "muted") {
      c.setMuted(false);
      setState("listening", "unmuted");
    } else {
      c.setMuted(true);
      prevSpeech.current = false;
      setState("muted", "user muted input");
    }
  }, [setState]);

  const interrupt = useCallback(() => {
    abortRef.current?.abort();
    tts.stop();
    log({ type: "system", source: "tts", text: "Response interrupted by user" });
    setState(capture.current ? "listening" : "idle", "interrupted");
  }, [log, setState, tts]);

  const testVoice = useCallback(() => {
    if (tts.status().state !== "ready") return pushError("unsupported", "Voice output is unsupported in this browser.");
    const prev = stateRef.current;
    setState("responding", "voice test");
    log({ type: "response", source: "tts", text: "Voice test (local, not AI-generated)" });
    tts.speak("Kira Ears voice output is working.", { voiceURI: settingsRef.current.voiceURI, volume: settingsRef.current.voiceVolume }, () => {
      if (stateRef.current === "responding") setState(capture.current ? (prev === "muted" ? "muted" : "listening") : "idle", "voice test done");
    });
  }, [log, pushError, setState, tts]);

  const recover = useCallback(() => {
    setState("idle", "error dismissed");
  }, [setState]);

  // Auto-listen only when permission was already granted (never prompts unexpectedly).
  const autoTried = useRef(false);
  useEffect(() => {
    if (autoTried.current || !settings.autoListen || permission !== "granted") return;
    autoTried.current = true;
    void start();
  }, [permission, settings.autoListen, start]);

  useEffect(() => () => { void capture.current?.stop(); cancelAnimationFrame(raf.current); stt.stop(); tts.stop(); }, [stt, tts]);

  return {
    state, permission, devices, metrics, errors, interim, sampleRate, activeDevice, supported,
    analyserRef: capture, timeBuf,
    providers: {
      stt: providersReady ? stt.status() : { id: stt.id, label: "Browser speech recognition", state: "checking" as const, detail: "Checking browser support." },
      tts: providersReady ? tts.status() : { id: tts.id, label: "Browser voice", state: "checking" as const, detail: "Checking browser support." },
      ai: ai.status(),
    },
    tts,
    start, stop, toggleMute, interrupt, testVoice, recover, refreshDevices,
    clearErrors: () => setErrors([]),
  };
}

export type KiraEngine = ReturnType<typeof useKiraEngine>;
