import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Settings2, X } from "lucide-react";
import { useKiraEngine } from "@/hooks/use-kira-engine";
import { useSettings } from "@/lib/kira/settings";
import { getServerProviderStatus } from "@/lib/kira/providers.functions";
import { EarsConsole } from "@/components/kira/EarsConsole";
import { SessionFeed } from "@/components/kira/SessionFeed";
import { AmbientPanel, Diagnostics } from "@/components/kira/SidePanels";
import { SettingsPanel } from "@/components/kira/SettingsPanel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kira Ears — Listening console" },
      { name: "description", content: "Kira Ears: a privacy-first listening layer with live mic metering, voice activity detection and session feed." },
      { property: "og:title", content: "Kira Ears — Listening console" },
      { property: "og:description", content: "Privacy-first companion audio layer for AI conversation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KiraEars,
});

function KiraEars() {
  const [settings, update] = useSettings();
  const fetchStatus = useServerFn(getServerProviderStatus);
  const status = useQuery({ queryKey: ["provider-status"], queryFn: () => fetchStatus(), retry: 1, staleTime: 60_000 });
  const engine = useKiraEngine(settings, status.data?.ai);
  const [showSettings, setShowSettings] = useState(false);
  const capturing = ["listening", "speech", "muted", "processing", "responding"].includes(engine.state);
  const muted = engine.state === "muted";

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-baseline gap-3">
            <h1 className="font-display text-2xl">Kira <span className="italic text-primary">Ears</span></h1>
            <span className="eyebrow hidden sm:inline">companion audio layer</span>
          </div>
          <div className="flex items-center gap-2">
            <div role="status" aria-live="polite" className={cn("flex items-center gap-2 rounded-full border px-3 py-1 text-xs", capturing && !muted && "border-live/50 text-live")}>
              <span className={cn("h-2 w-2 rounded-full", capturing ? (muted ? "bg-warn" : "bg-live animate-live") : "bg-muted-foreground")} />
              {capturing ? (muted ? "Mic open · muted" : "Mic live") : "Mic off"}
            </div>
            <button onClick={() => setShowSettings((s) => !s)} className="rounded-full border p-2 lg:hidden" aria-label="Settings">
              {showSettings ? <X className="h-4 w-4" /> : <Settings2 className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          {showSettings && <div className="lg:hidden"><SettingsPanel engine={engine} settings={settings} update={update} /></div>}
          <EarsConsole engine={engine} settings={settings} update={update} />
          <SessionFeed />
        </div>
        <aside className="space-y-5">
          <AmbientPanel engine={engine} />
          <div className="hidden lg:block"><SettingsPanel engine={engine} settings={settings} update={update} /></div>
          {settings.showDiagnostics && (
            <Diagnostics engine={engine} server={status.data ? [status.data.ai, status.data.stt] : []} serverError={status.error ? (status.error as Error).message : undefined} />
          )}
        </aside>
      </main>
      <footer className="mx-auto max-w-7xl px-6 pb-8 text-xs text-muted-foreground">
        Kira Ears listens only through your microphone, only after you allow it. It cannot hear other apps, system audio, or other AI services.
      </footer>
    </div>
  );
}
