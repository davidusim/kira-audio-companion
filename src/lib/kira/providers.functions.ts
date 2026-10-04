import { createServerFn } from "@tanstack/react-start";
import type { ProviderStatus } from "./providers";

/**
 * Reports which server-side providers are configured, using only env presence.
 * Never returns secret values.
 */
export const getServerProviderStatus = createServerFn({ method: "GET" }).handler(async () => {
  const hasAiKey = !!process.env["KIRA_AI_API_KEY"] || !!process.env["LOVABLE_API_KEY"];
  const hasSttKey = !!process.env["KIRA_STT_API_KEY"];
  const ai: ProviderStatus = hasAiKey
    ? { id: "server-ai", label: "AI response", state: "pending-integration", detail: "Credentials detected on the server; the response adapter is not wired in yet." }
    : { id: "server-ai", label: "AI response", state: "unconfigured", detail: "No AI credentials on the server. Responses are disabled." };
  const stt: ProviderStatus = hasSttKey
    ? { id: "server-stt", label: "Cloud transcription", state: "pending-integration", detail: "KIRA_STT_API_KEY present; adapter not wired in yet." }
    : { id: "server-stt", label: "Cloud transcription", state: "unconfigured", detail: "Optional. Set KIRA_STT_API_KEY to enable a server transcription adapter." };
  return { ai, stt, checkedAt: Date.now() };
});
