// Ambient / speaker classifier extension points. No classifiers ship yet — the UI must show
// "no classifier installed" rather than fabricating detections.
import type { FrameFeatures } from "./analysis";

export interface AmbientDetection {
  category: string; // e.g. "music", "keyboard", "dog bark"
  confidence: number; // 0..1, from a real model only
}

export interface AmbientClassifier {
  readonly id: string;
  readonly label: string;
  /** Called with features (and optionally raw frames) at the classifier's own cadence. */
  classify(f: FrameFeatures, frame: Float32Array, sampleRate: number): AmbientDetection[] | Promise<AmbientDetection[]>;
}

/**
 * Assigns session-local labels like "Speaker 1" via diarization. Labels are NOT identities and
 * must never be mapped to real names automatically.
 */
export interface SpeakerLabeler {
  readonly id: string;
  label(segment: Float32Array, sampleRate: number): Promise<string | undefined>;
}

export const ambientClassifiers: AmbientClassifier[] = [];
export const speakerLabeler: SpeakerLabeler | null = null;
