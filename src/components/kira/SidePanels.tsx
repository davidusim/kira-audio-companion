import { Fragment, useEffect, useState } from "react";
import type { KiraEngine } from "@/hooks/use-kira-engine";
import { ambientClassifiers, speakerLabeler } from "@/lib/kira/classifiers";
import type { ProviderStatus } from "@/lib/kira/providers";
import { cn } from "@/lib/utils";

export function AmbientPanel({ engine }: { engine: KiraEngine }) {
  const m = engine.metrics;
  const active = engine.state !== "idle" && engine.state !== "error";
  return (
    <section className="panel p-5">
      <p className="eyebrow">Ambient context</p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <Stat k="Signal" v={active ? (m.isSpeech ? "Speech-like" : m.rms > m.threshold ? "Non-speech sound" : "Quiet / noise floor") : "—"} />
        <Stat k="Centroid" v={active ? `${Math.round(m.centroidHz)} Hz` : "—"} />
        <Stat k="Voice band" v={active ? `${Math.round(m.speechBandRatio * 100)}%` : "—"} />
        <Stat k="Noise floor" v={active ? `${(20 * Math.log10(m.noiseFloor || 1e-5)).toFixed(0)} dB` : "—"} />
      </div>
      <p className="mt-4 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
        {ambientClassifiers.length
          ? `${ambientClassifiers.length} classifier(s) installed.`
          : "No ambient classifier installed. Kira shows raw signal features only — it will not guess sound categories like music or speech of specific people."}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Speakers: {speakerLabeler ? "session labels (Speaker 1, 2…) — never identities." : "diarization not installed; no speaker labels are assigned."}
      </p>
    </section>
  );
}

const STATE_COLOR: Record<ProviderStatus["state"], string> = {
  checking: "bg-warn",
  ready: "bg-ok",
  unconfigured: "bg-muted-foreground",
  unsupported: "bg-destructive",
  "pending-integration": "bg-warn",
  error: "bg-destructive",
};

export function ProviderList({ items }: { items: ProviderStatus[] }) {
  return (
    <ul className="space-y-2">
      {items.map((p) => (
        <li key={p.id} className="rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span>{p.label}</span>
            <span className="flex items-center gap-1.5 eyebrow"><span className={cn("h-1.5 w-1.5 rounded-full", STATE_COLOR[p.state])} />{p.state}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{p.detail}</p>
        </li>
      ))}
    </ul>
  );
}

export function Diagnostics({ engine, server, serverError }: { engine: KiraEngine; server: ProviderStatus[]; serverError?: string }) {
  const m = engine.metrics;
  const [secureContext, setSecureContext] = useState("—");
  useEffect(() => setSecureContext(window.isSecureContext ? "yes" : "no"), []);
  const rows: [string, string][] = [
    ["Capture API", engine.supported ? "supported" : "unsupported"],
    ["Permission", engine.permission],
    ["Engine state", engine.state],
    ["Input device", engine.activeDevice ?? "—"],
    ["Devices found", String(engine.devices.length)],
    ["Sample rate", engine.sampleRate ? `${engine.sampleRate} Hz` : "—"],
    ["Level", `${m.db.toFixed(1)} dBFS · peak ${m.peak.toFixed(2)}`],
    ["ZCR", m.zcr.toFixed(3)],
    ["VAD", `${m.isSpeech ? "speech" : "no speech"} · thr ${m.threshold.toFixed(4)}`],
    ["Secure context", secureContext],
  ];
  return (
    <section className="panel p-5">
      <p className="eyebrow">Diagnostics</p>
      <dl className="mt-3 grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5 font-mono text-xs">
        {rows.map(([k, v]) => (<Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd className="truncate">{v}</dd></Fragment>))}
      </dl>
      <p className="eyebrow mt-5 mb-2">Providers</p>
      <ProviderList items={[engine.providers.stt, engine.providers.tts, ...server]} />
      {serverError && <p className="mt-2 text-xs text-destructive">Server status check failed: {serverError}</p>}
      <div className="mt-5 flex items-center justify-between"><p className="eyebrow">Recent errors</p>{engine.errors.length > 0 && <button onClick={engine.clearErrors} className="text-xs text-muted-foreground hover:underline">Clear</button>}</div>
      <ul className="mt-2 space-y-1 text-xs">
        {engine.errors.length === 0 && <li className="text-muted-foreground">None</li>}
        {engine.errors.slice(0, 6).map((e) => <li key={e.id}><span className="font-mono text-destructive">{e.code}</span> <span className="text-muted-foreground">{e.message}</span></li>)}
      </ul>
    </section>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return <div className="rounded-lg border p-2.5"><p className="eyebrow">{k}</p><p className="mt-1 font-mono text-xs">{v}</p></div>;
}
