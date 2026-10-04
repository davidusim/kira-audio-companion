import { useCallback, useEffect, useState } from "react";

export interface KiraSettings {
  deviceId: string; // "" = default
  sensitivity: number; // 0..1
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  autoListen: boolean; // start listening on load if permission already granted
  sttEnabled: boolean;
  voiceEnabled: boolean;
  voiceURI: string;
  voiceVolume: number; // 0..1
  storeHistory: boolean;
  logVadEvents: boolean;
  showDiagnostics: boolean;
}

export const DEFAULT_SETTINGS: KiraSettings = {
  deviceId: "",
  sensitivity: 0.6,
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  autoListen: false,
  sttEnabled: true,
  voiceEnabled: true,
  voiceURI: "",
  voiceVolume: 0.8,
  storeHistory: true,
  logVadEvents: true,
  showDiagnostics: true,
};

const KEY = "kira-ears.settings.v1";

export function useSettings() {
  const [settings, setSettings] = useState<KiraSettings>(DEFAULT_SETTINGS);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  }, []);
  const update = useCallback((patch: Partial<KiraSettings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  return [settings, update] as const;
}
