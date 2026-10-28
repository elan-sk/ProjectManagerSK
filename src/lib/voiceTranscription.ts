import { spawn } from "node:child_process";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

export const MAX_VOICE_SECONDS = 300;
const SAMPLE_RATE = 16_000;
const MODEL_ID = "onnx-community/whisper-base";
const DECODE_TIMEOUT_MS = 60_000;

export type TranscriptionResult = { ok: true; text: string; seconds: number } | { ok: false; reason: "too_long" | "failed" };

type Transcriber = (audio: Float32Array, options: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>;

const TRANSFORMERS_MODULE: string = "@huggingface/transformers";

type TransformersModule = {
  env: { cacheDir: string };
  pipeline: (task: string, model: string, options: Record<string, unknown>) => Promise<unknown>;
};

const globalForVoice = globalThis as unknown as { voiceModel?: Promise<Transcriber>; voiceQueue?: Promise<unknown> };

function loadModel(): Promise<Transcriber> {
  globalForVoice.voiceModel ??= (async () => {
    const { pipeline, env } = (await import(/* webpackIgnore: true */ TRANSFORMERS_MODULE)) as TransformersModule;
    env.cacheDir = path.join(process.cwd(), ".models-cache");
    const pipe = await pipeline("automatic-speech-recognition", MODEL_ID, {
      device: "cpu",
      dtype: { encoder_model: "fp32", decoder_model_merged: "q8" },
    });
    return pipe as unknown as Transcriber;
  })().catch((err) => {
    globalForVoice.voiceModel = undefined;
    throw err;
  });
  return globalForVoice.voiceModel;
}

function decodeToPcm(audio: Buffer): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error("ffmpeg no está disponible"));
    const proc = spawn(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-f", "f32le", "-ac", "1", "-ar", String(SAMPLE_RATE), "pipe:1"]);
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => proc.kill("SIGKILL"), DECODE_TIMEOUT_MS);
    proc.stdout.on("data", (c: Buffer) => chunks.push(c));
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`ffmpeg terminó con código ${code}`));
      const all = Buffer.concat(chunks);
      const copy = new ArrayBuffer(all.length - (all.length % 4));
      new Uint8Array(copy).set(all.subarray(0, copy.byteLength));
      resolve(new Float32Array(copy));
    });
    proc.stdin.on("error", () => {});
    proc.stdin.end(audio);
  });
}

async function transcribeNow(audio: Buffer, declaredSeconds?: number | null): Promise<TranscriptionResult> {
  if (declaredSeconds && declaredSeconds > MAX_VOICE_SECONDS) return { ok: false, reason: "too_long" };
  try {
    const pcm = await decodeToPcm(audio);
    const seconds = pcm.length / SAMPLE_RATE;
    if (seconds > MAX_VOICE_SECONDS) return { ok: false, reason: "too_long" };
    if (seconds < 0.3) return { ok: false, reason: "failed" };
    const transcriber = await loadModel();
    const out = await transcriber(pcm, { language: "spanish", task: "transcribe", chunk_length_s: 30, stride_length_s: 5 });
    const text = (Array.isArray(out) ? out.map((o) => o.text).join(" ") : out.text).replace(/\s+/g, " ").trim();
    return text ? { ok: true, text, seconds } : { ok: false, reason: "failed" };
  } catch (err) {
    console.error("[voz] no se pudo transcribir la nota de voz", err);
    return { ok: false, reason: "failed" };
  }
}

export function transcribeAudio(audio: Buffer, declaredSeconds?: number | null): Promise<TranscriptionResult> {
  const run = (globalForVoice.voiceQueue ?? Promise.resolve()).then(() => transcribeNow(audio, declaredSeconds));
  globalForVoice.voiceQueue = run.catch(() => undefined);
  return run;
}
