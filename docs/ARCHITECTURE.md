# Kira Ears — Developer Guide

Kira Ears is a companion audio layer: it listens through the user's microphone **only after explicit permission**, analyses the signal locally, detects speech activity, records a local session feed, and exposes provider slots for transcription (STT), AI responses, and voice output (TTS).

## What it can and cannot do
- Can: capture the mic via `getUserMedia`, analyse audio with the Web Audio API, run a local VAD, transcribe via the browser Web Speech API (where available), speak via `speechSynthesis`.
- Cannot: access system audio, other apps/tabs, ChatGPT or other AI products' internals, or the mic without permission. It does not identify people.

## Layout
```text
src/lib/kira/
  types.ts               Domain types (EngineState, FeedEvent, Session, KiraError, SignalMetrics)
  audio-capture.ts       MicCapture (getUserMedia + AnalyserNode), error mapping, device list, permission query
  analysis.ts            computeFeatures (RMS, peak, ZCR, spectral centroid, 300–3400 Hz ratio) + HeuristicVad
  classifiers.ts         AmbientClassifier / SpeakerLabeler interfaces (none installed — never fabricate)
  providers.ts           SttProvider / AiProvider / TtsProvider + browser adapters + UnconfiguredAiProvider
  providers.functions.ts Server function reporting provider config from env presence (no secrets returned)
  session-store.ts       External store + SessionPersistence adapter (localStorage now)
  settings.ts            Persisted user settings
src/hooks/use-kira-engine.ts  Orchestrator: state machine, rAF analysis loop, STT → AI → TTS pipeline
src/components/kira/     Console, Waveform, SessionFeed, Ambient/Diagnostics panels, Settings
```

## State machine
`idle → requesting → listening ⇄ speech`, `listening → processing → responding → listening`, `muted`, `error`. Every transition is logged to the session feed with its reason. `speech` is driven only by VAD output on real frames.

## VAD
Heuristic: frame RMS must exceed an adaptive noise floor × sensitivity multiplier, with ≥35% energy in the voice band and low ZCR, for 3 consecutive frames (onset); 450 ms hangover. The floor adapts only on non-speech frames. Replace by implementing `VoiceActivityDetector` (e.g. Silero VAD via ONNX/WASM in an AudioWorklet).

## Environment variables (server only)
| Name | Purpose |
| --- | --- |
| `KIRA_AI_API_KEY` | Credentials for an AI response adapter (status shows `pending-integration` until wired) |
| `KIRA_STT_API_KEY` | Optional cloud transcription adapter |
| `LOVABLE_API_KEY` | Provisioned by Lovable when Lovable AI is enabled; also detected as AI credentials |

Keys are read only inside `createServerFn` handlers. Never prefix secrets with `VITE_`.

## Privacy model
- Mic active state is always visible in the header (red pulsing "Mic live").
- Raw audio is never stored or uploaded by Kira. Only events/transcripts are kept in `localStorage` (clearable in the feed).
- Browser STT (Chrome) sends audio to the browser vendor — disclosed in the UI.
- Auto-listen only starts if permission was already granted; it never triggers a surprise prompt.

## Local setup
`bun install && bun run dev`. Mic access requires HTTPS or `localhost`.

## Next integration steps
1. AI responses: add a streaming server route calling the Lovable AI Gateway; implement `AiProvider.respond` against it and report `ready` from `getServerProviderStatus`.
2. Realtime voice: consider a GPT Live session for full duplex speech.
3. Classifiers: add YAMNet (TF.js) as an `AmbientClassifier` for speech/music/ambient events.
4. Diarization: implement `SpeakerLabeler` producing session-local labels only.
5. Persistence: implement `SessionPersistence` backed by Lovable Cloud with per-user RLS.
6. Move analysis into an `AudioWorklet` for lower main-thread load.
