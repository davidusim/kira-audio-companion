// Session store with a pluggable persistence adapter (localStorage now, server later).
import { useSyncExternalStore } from "react";
import { uid, type FeedEvent, type Session } from "./types";

export interface SessionPersistence {
  load(): Session[];
  save(sessions: Session[]): void;
}

const KEY = "kira-ears.sessions.v1";
const MAX_SESSIONS = 20;
const MAX_EVENTS = 500;

export const localPersistence: SessionPersistence = {
  load() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "[]");
    } catch {
      return [];
    }
  },
  save(s) {
    try {
      localStorage.setItem(KEY, JSON.stringify(s.slice(0, MAX_SESSIONS)));
    } catch {
      /* quota — ignore */
    }
  },
};

type Snapshot = { sessions: Session[]; activeId: string | null };

class SessionStore {
  private snap: Snapshot = { sessions: [], activeId: null };
  private listeners = new Set<() => void>();
  private loaded = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(private persistence: SessionPersistence) {}

  hydrate() {
    if (this.loaded) return;
    this.loaded = true;
    this.snap = { sessions: this.persistence.load(), activeId: null };
    this.emit(false);
  }
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  get = () => this.snap;
  private emit(persist = true) {
    this.listeners.forEach((l) => l());
    if (!persist) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.persistence.save(this.snap.sessions), 400);
  }
  startSession(): string {
    const s: Session = { id: uid(), startedAt: Date.now(), events: [] };
    this.snap = { sessions: [s, ...this.snap.sessions].slice(0, MAX_SESSIONS), activeId: s.id };
    this.emit();
    return s.id;
  }
  endSession() {
    const id = this.snap.activeId;
    if (!id) return;
    this.snap = {
      activeId: null,
      sessions: this.snap.sessions.map((s) => (s.id === id ? { ...s, endedAt: Date.now() } : s)),
    };
    this.emit();
  }
  add(e: Omit<FeedEvent, "id" | "t">) {
    const id = this.snap.activeId ?? this.startSession();
    const ev: FeedEvent = { ...e, id: uid(), t: Date.now() };
    this.snap = {
      ...this.snap,
      sessions: this.snap.sessions.map((s) =>
        s.id === id ? { ...s, events: [...s.events, ev].slice(-MAX_EVENTS) } : s,
      ),
    };
    this.emit();
  }
  clearAll() {
    this.snap = { sessions: [], activeId: null };
    this.emit();
  }
}

export const sessionStore = new SessionStore(localPersistence);

const SERVER: Snapshot = { sessions: [], activeId: null };
export function useSessions() {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.get, () => SERVER);
}
