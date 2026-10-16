/**
 * Client-side audio preparation: decode whatever MediaRecorder produced
 * (webm/opus, mp4/aac, ...), convert it to 16 kHz mono 16-bit WAV (a format
 * every STT backend reads reliably), and analyse the real samples to decide
 * whether there was actually any speech. This is the "only translate when
 * someone really spoke" gate — silence / room noise never reaches the AI.
 */

export interface PreparedAudio {
  blob: Blob;
  mimeType: string;
  hasSpeech: boolean;
  /** Voiced duration in ms (frames clearly above the noise floor). */
  voicedMs: number;
  peak: number;
}

const TARGET_RATE = 16000;
const FRAME = 320; // 20 ms @ 16 kHz
const MIN_VOICED_FRAMES = 12; // >= 240 ms of voiced audio
const MIN_PEAK_RMS = 0.02;
const MAX_WAV_BYTES = 4_000_000; // stay under serverless body limit

function encodeWav(samples: Float32Array, rate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  w(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

export async function prepareAudio(blob: Blob, mimeType: string): Promise<PreparedAudio> {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = new AudioCtx();
    let decoded: AudioBuffer;
    try {
      decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    } finally {
      ctx.close().catch(() => {});
    }

    const length = Math.max(1, Math.ceil(decoded.duration * TARGET_RATE));
    const offline = new OfflineAudioContext(1, length, TARGET_RATE);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start();
    const rendered = await offline.startRendering();
    const data = rendered.getChannelData(0);

    // Frame RMS + adaptive noise floor (20th percentile of frame energy).
    const frames = Math.floor(data.length / FRAME);
    const rms = new Float32Array(frames);
    let peak = 0;
    for (let f = 0; f < frames; f++) {
      let sum = 0;
      for (let i = 0; i < FRAME; i++) {
        const s = data[f * FRAME + i];
        sum += s * s;
      }
      rms[f] = Math.sqrt(sum / FRAME);
      if (rms[f] > peak) peak = rms[f];
    }
    const sorted = Array.from(rms).sort((a, b) => a - b);
    const floor = frames ? sorted[Math.floor(frames * 0.2)] : 0;
    const threshold = Math.max(0.012, floor * 3);

    let first = -1;
    let last = -1;
    let voiced = 0;
    for (let f = 0; f < frames; f++) {
      if (rms[f] > threshold) {
        voiced++;
        if (first < 0) first = f;
        last = f;
      }
    }

    const hasSpeech = voiced >= MIN_VOICED_FRAMES && peak >= MIN_PEAK_RMS;
    if (!hasSpeech) {
      return { blob, mimeType, hasSpeech: false, voicedMs: voiced * 20, peak };
    }

    // Trim leading/trailing silence (keep a little padding) — silent edges
    // are where STT models like to hallucinate.
    const padFrames = 12;
    const startSample = Math.max(0, (first - padFrames) * FRAME);
    const endSample = Math.min(data.length, (last + 1 + padFrames) * FRAME);
    const wav = encodeWav(data.subarray(startSample, endSample), TARGET_RATE);

    if (wav.size > MAX_WAV_BYTES) {
      return { blob, mimeType, hasSpeech: true, voicedMs: voiced * 20, peak };
    }
    return { blob: wav, mimeType: 'audio/wav', hasSpeech: true, voicedMs: voiced * 20, peak };
  } catch {
    // Could not decode in this WebView — fall back to the raw recording and let
    // the server-side checks handle it, rather than dropping the user's speech.
    return { blob, mimeType, hasSpeech: true, voicedMs: 0, peak: 0 };
  }
}
