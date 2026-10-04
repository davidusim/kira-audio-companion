import { useState } from "react";
import { useSessions, sessionStore } from "@/lib/kira/session-store";
import type { EventType, FeedEvent } from "@/lib/kira/types";
import { cn } from "@/lib/utils";

const TYPE_STYLE: Record<EventType, string> = {
  state: "text-muted-foreground",
  vad: "text-speech",
  transcript: "text-foreground",
  ambient: "text-warn",
  response: "text-primary",
  error: "text-destructive",
  system: "text-muted-foreground",
};

const fmt = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function SessionFeed() {
  const { sessions, activeId } = useSessions();
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "speech">("all");
  const session = sessions.find((s) => s.id === (selected ?? activeId)) ?? sessions[0];
  const events = (session?.events ?? []).filter((e) => filter === "all" || e.type === "transcript" || e.type === "response").slice().reverse();

  return (
    <section className="panel flex min-h-[22rem] flex-col p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="eyebrow">Session feed</p>
          <p className="text-sm text-muted-foreground">
            {session ? `${new Date(session.startedAt).toLocaleString()}${session.id === activeId ? " · live" : ""}` : "No sessions yet"}
          </p>
        </div>
        <div className="flex gap-2">
          <select value={session?.id ?? ""} onChange={(e) => setSelected(e.target.value)} className="rounded-lg border bg-background px-2 py-1 text-xs" aria-label="Choose session">
            {sessions.map((s) => <option key={s.id} value={s.id}>{new Date(s.startedAt).toLocaleString()} ({s.events.length})</option>)}
          </select>
          <button onClick={() => setFilter(filter === "all" ? "speech" : "all")} className="rounded-lg border px-2 py-1 text-xs">{filter === "all" ? "All events" : "Words only"}</button>
        </div>
      </div>
      <ol className="mt-4 max-h-[28rem] flex-1 space-y-1.5 overflow-y-auto pr-1" aria-live="polite">
        {events.length === 0 && <li className="py-10 text-center text-sm text-muted-foreground">Start listening — real state changes, speech segments and transcripts appear here.</li>}
        {events.map((e) => <Row key={e.id} e={e} />)}
      </ol>
      {sessions.length > 0 && (
        <button onClick={() => confirm("Delete all locally stored sessions?") && sessionStore.clearAll()} className="mt-3 self-end text-xs text-muted-foreground underline-offset-4 hover:underline">Clear local history</button>
      )}
    </section>
  );
}

function Row({ e }: { e: FeedEvent }) {
  return (
    <li className="grid grid-cols-[4.5rem_5.5rem_1fr] gap-2 border-b border-border/50 py-1.5 text-sm last:border-0">
      <time className="font-mono text-xs text-muted-foreground">{fmt(e.t)}</time>
      <span className={cn("eyebrow truncate", TYPE_STYLE[e.type])}>{e.type}·{e.source}</span>
      <span className={cn(e.type === "transcript" ? "text-foreground" : "text-muted-foreground", "break-words")}>
        {e.speakerLabel && <span className="mr-1 rounded bg-muted px-1 text-xs">{e.speakerLabel}</span>}
        {e.text}
        {e.confidence !== undefined && <span className="ml-1 font-mono text-xs opacity-60">{Math.round(e.confidence * 100)}%</span>}
      </span>
    </li>
  );
}
