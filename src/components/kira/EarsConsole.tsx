import { Mic, MicOff, Square, Volume2, VolumeX, RotateCcw } from "lucide-react";
import type { KiraEngine } from "@/hooks/use-kira-engine";
import type { KiraSettings } from "@/lib/kira/settings";
import type { EngineState } from "@/lib/kira/types";
import { Waveform } from "./Waveform";
import { cn } from "@/lib/utils";

const LABELS: Record<EngineState, { title: string; hint: string }> = {
  idle: { title: "Idle", hint: "Microphone is off. Nothing is being captured." },
  requesting: { title: "Requesting access", hint: "Approve the microphone prompt in your browser." },
  listening: { title: "Listening", hint: "Capturing locally. Waiting for speech." },
  speech: { title: "Speech detected", hint: "Speech-like audio above the noise floor." },
  processing: { title: "Processing", hint: "Sending your words to the AI provider." },
  responding: { title: "Responding", hint: "Voice output is playing." },
  muted: { title: "Muted", hint: "Mic stream open but input is silenced." },
  error: { title: "Needs attention", hint: "See the message below to recover." },
};

export function EarsConsole({ engine, settings, update }: { engine: KiraEngine; settings: KiraSettings; update: (p: Partial<KiraSettings>) => void }) {
  const { state, metrics } = engine;
  const capturing = ["listening", "speech", "muted", "processing", "responding"].includes(state);
  const level = Math.min(1, Math.max(0, (metrics.db + 70) / 60));
  const thresholdPos = metrics.threshold > 0 ? Math.min(1, Math.max(0, (20 * Math.log10(metrics.threshold) + 70) / 60)) : 0;
  const lastError = engine.errors[0];

  return (
    <section className="panel relative overflow-hidden p-5 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Ears console</p>
          <h2 className="mt-1 font-display text-4xl sm:text-5xl">{LABELS[state].title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{LABELS[state].hint}</p>
        </div>
        <span className="eyebrow rounded-full border px-3 py-1">{state}</span>
      </div>

      <div className="my-8 flex flex-col items-center gap-6">
        <div className="relative">
          {state === "speech" && <span className="absolute inset-0 rounded-full border border-speech animate-ring" />}
          <button
            onClick={() => (capturing ? engine.stop() : engine.start())}
            disabled={state === "requesting" || !engine.supported}
            aria-pressed={capturing}
            aria-label={capturing ? "Stop listening" : "Start listening"}
            className={cn(
              "orb relative grid h-40 w-40 place-items-center rounded-full border transition-all duration-300 disabled:opacity-50 sm:h-48 sm:w-48",
              state === "speech" ? "glow-speech" : capturing ? "glow-primary" : "hover:glow-primary",
            )}
            style={{ transform: capturing ? `scale(${1 + level * 0.06})` : undefined }}
          >
            {capturing ? <Square className="h-10 w-10 text-primary" /> : <Mic className="h-12 w-12 text-primary" />}
          </button>
        </div>
        <p className="text-sm text-muted-foreground">{capturing ? "Tap to stop listening" : engine.supported ? "Tap to start listening" : "Microphone capture unsupported here"}</p>
      </div>

      <Waveform buffer={engine.timeBuf} active={capturing && state !== "muted"} speech={state === "speech"} />

      <div className="mt-4">
        <div className="flex justify-between eyebrow"><span>Input level</span><span>{capturing ? `${metrics.db.toFixed(0)} dBFS` : "—"}</span></div>
        <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full transition-[width] duration-75", metrics.isSpeech ? "bg-speech" : "bg-primary")} style={{ width: `${level * 100}%` }} />
          {capturing && <div className="absolute top-0 h-full w-px bg-foreground/60" style={{ left: `${thresholdPos * 100}%` }} title="VAD threshold" />}
        </div>
      </div>

      {interimLine(engine.interim)}

      {state === "error" && lastError && (
        <div role="alert" className="mt-5 flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span>{lastError.message}</span>
          <button onClick={() => { engine.recover(); void engine.start(); }} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-3 py-1.5 font-medium text-primary-foreground">
            <RotateCcw className="h-4 w-4" /> Try again
          </button>
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CtlButton onClick={engine.toggleMute} disabled={!capturing} active={state === "muted"} icon={state === "muted" ? MicOff : Mic} label={state === "muted" ? "Unmute" : "Mute"} />
        <CtlButton onClick={() => update({ voiceEnabled: !settings.voiceEnabled })} active={!settings.voiceEnabled} icon={settings.voiceEnabled ? Volume2 : VolumeX} label={settings.voiceEnabled ? "Voice on" : "Voice off"} />
        <CtlButton onClick={engine.interrupt} disabled={state !== "responding" && state !== "processing"} icon={Square} label="Interrupt" />
        <CtlButton onClick={engine.testVoice} disabled={!settings.voiceEnabled} icon={Volume2} label="Test voice" />
      </div>
      <label className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
        <span className="eyebrow w-16">Volume</span>
        <input type="range" min={0} max={1} step={0.05} value={settings.voiceVolume} onChange={(e) => update({ voiceVolume: +e.target.value })} className="flex-1" aria-label="Voice volume" />
        <span className="w-10 text-right font-mono text-xs">{Math.round(settings.voiceVolume * 100)}%</span>
      </label>
    </section>
  );
}

function interimLine(t: string) {
  if (!t) return null;
  return <p className="mt-4 truncate font-mono text-sm text-muted-foreground">… {t}</p>;
}

function CtlButton({ onClick, disabled, active, icon: Icon, label }: { onClick: () => void; disabled?: boolean; active?: boolean; icon: typeof Mic; label: string }) {
  return (
    <button onClick={onClick} disabled={disabled} className={cn("flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent", active && "border-primary/50 text-primary")}>
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}
