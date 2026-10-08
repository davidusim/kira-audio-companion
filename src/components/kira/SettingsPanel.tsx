import { useEffect, useState } from "react";
import type { KiraEngine } from "@/hooks/use-kira-engine";
import type { KiraSettings } from "@/lib/kira/settings";

export function SettingsPanel({ engine, settings, update }: { engine: KiraEngine; settings: KiraSettings; update: (p: Partial<KiraSettings>) => void }) {
  const [voices, setVoices] = useState<{ uri: string; name: string; lang: string }[]>([]);
  useEffect(() => {
    const load = () => setVoices(engine.tts.voices());
    load();
    window.speechSynthesis?.addEventListener?.("voiceschanged", load);
    return () => window.speechSynthesis?.removeEventListener?.("voiceschanged", load);
  }, [engine.tts]);
  const live = engine.state !== "idle" && engine.state !== "error";

  return (
    <section className="panel space-y-5 p-5">
      <p className="eyebrow">Settings</p>
      <Field label="Microphone" {...(live ? { note: "Stop and restart listening to apply." } : engine.permission !== "granted" ? { note: "Device names appear after permission is granted." } : {})}>
        <select value={settings.deviceId} onChange={(e) => update({ deviceId: e.target.value })} className="w-full rounded-lg border bg-background px-2 py-2 text-sm">
          <option value="">System default</option>
          {engine.devices.filter((d) => d.deviceId && d.deviceId !== "default").map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>)}
        </select>
      </Field>
      <Field label={`Sensitivity · ${Math.round(settings.sensitivity * 100)}%`} note="Higher detects quieter speech but may react to noise.">
        <input type="range" min={0} max={1} step={0.05} value={settings.sensitivity} onChange={(e) => update({ sensitivity: +e.target.value })} className="w-full" />
      </Field>
      <Toggle label="Browser noise suppression" v={settings.noiseSuppression} on={(v) => update({ noiseSuppression: v })} />
      <Toggle label="Echo cancellation" v={settings.echoCancellation} on={(v) => update({ echoCancellation: v })} />
      <Toggle label="Auto-listen when permission already granted" v={settings.autoListen} on={(v) => update({ autoListen: v })} />
      <Toggle label="Transcribe speech (browser)" v={settings.sttEnabled} on={(v) => update({ sttEnabled: v })} />
      <Field label="Response voice">
        <select value={settings.voiceURI} onChange={(e) => update({ voiceURI: e.target.value })} className="w-full rounded-lg border bg-background px-2 py-2 text-sm">
          <option value="">Browser default</option>
          {voices.map((v) => <option key={v.uri} value={v.uri}>{v.name} ({v.lang})</option>)}
        </select>
      </Field>
      <div className="border-t pt-4">
        <p className="eyebrow mb-3">Privacy</p>
        <Toggle label="Log speech start/stop events" v={settings.logVadEvents} on={(v) => update({ logVadEvents: v })} />
        <p className="mt-3 text-xs text-muted-foreground">Raw audio is never stored or uploaded by Kira. History (events and transcripts) stays in this browser. Browser speech recognition may be processed by your browser vendor.</p>
      </div>
      <Toggle label="Show diagnostics" v={settings.showDiagnostics} on={(v) => update({ showDiagnostics: v })} />
    </section>
  );
}

function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-sm">{label}</span>{children}{note && <span className="block text-xs text-muted-foreground">{note}</span>}</label>;
}

function Toggle({ label, v, on }: { label: string; v: boolean; on: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1 text-sm">
      <span>{label}</span>
      <button type="button" role="switch" aria-checked={v} onClick={() => on(!v)} className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${v ? "bg-primary" : "bg-muted"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-foreground transition-all ${v ? "left-[1.125rem]" : "left-0.5"}`} />
      </button>
    </label>
  );
}
