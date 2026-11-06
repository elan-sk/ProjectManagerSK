"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { APP_VOICE_MAX_SECONDS as MAX_SECONDS } from "@/lib/uploadLimits";

const noSubscription = () => () => {};
const LEVEL_BARS = 40;
const POLL_MS = 2000;
const POLL_LIMIT_MS = 5 * 60_000;
const FAILED = "No se pudo entender el audio; puede intentarlo de nuevo o escribir la respuesta.";
const OFFLINE = "No se pudo enviar el audio; revisar la conexión e intentarlo de nuevo.";

function canRecord() {
  return typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

export type VoiceState = "idle" | "recording" | "paused" | "transcribing";

type Session = {
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
  audioContext: AudioContext | null;
  analyser: AnalyserNode | null;
  elapsedBefore: number;
  resumedAt: number;
  discard: boolean;
};

export function useVoiceRecorder(onText: (text: string) => void) {
  const supported = useSyncExternalStore(noSubscription, canRecord, () => false);
  const [state, setState] = useState<VoiceState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [limitReached, setLimitReached] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTextRef = useRef(onText);

  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  useEffect(() => {
    const timer = timerRef;
    const current = sessionRef;
    return () => {
      if (timer.current) clearInterval(timer.current);
      const session = current.current;
      current.current = null;
      if (!session) return;
      session.discard = true;
      if (session.recorder.state !== "inactive") session.recorder.stop();
      session.stream.getTracks().forEach((t) => t.stop());
      void session.audioContext?.close();
    };
  }, []);

  function elapsed(session: Session) {
    return session.elapsedBefore + (session.recorder.state === "recording" ? (Date.now() - session.resumedAt) / 1000 : 0);
  }

  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  function pause() {
    const session = sessionRef.current;
    if (!session || session.recorder.state !== "recording") return;
    session.elapsedBefore = elapsed(session);
    session.recorder.pause();
    setState("paused");
  }

  function tick() {
    const session = sessionRef.current;
    if (!session) return;
    const total = elapsed(session);
    setSeconds(Math.min(MAX_SECONDS, Math.floor(total)));
    if (session.analyser && session.recorder.state === "recording") {
      const data = new Uint8Array(session.analyser.fftSize);
      session.analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
      setLevels((prev) => [...prev, Math.min(1, peak / 64)].slice(-LEVEL_BARS));
    }
    if (total >= MAX_SECONDS && session.recorder.state === "recording") {
      pause();
      setLimitReached(true);
    }
  }

  async function start() {
    if (state !== "idle") return;
    setError(null);
    setLimitReached(false);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("No hay permiso para usar el micrófono. Se puede habilitar en el candado de la barra de direcciones o seguir escribiendo.");
      return;
    }
    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    try {
      audioContext = new AudioContext();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      audioContext.createMediaStreamSource(stream).connect(analyser);
    } catch {
      audioContext = null;
      analyser = null;
    }
    const recorder = new MediaRecorder(stream);
    const session: Session = { recorder, stream, chunks: [], audioContext, analyser, elapsedBefore: 0, resumedAt: Date.now(), discard: false };
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) session.chunks.push(e.data);
    };
    sessionRef.current = session;
    recorder.start();
    setState("recording");
    setSeconds(0);
    setLevels([]);
    timerRef.current = setInterval(tick, 100);
  }

  function resume() {
    const session = sessionRef.current;
    if (!session || session.recorder.state !== "paused" || session.elapsedBefore >= MAX_SECONDS) return;
    session.resumedAt = Date.now();
    session.recorder.resume();
    setState("recording");
  }

  function close(session: Session) {
    stopTimer();
    session.stream.getTracks().forEach((t) => t.stop());
    void session.audioContext?.close();
    if (sessionRef.current === session) sessionRef.current = null;
  }

  function cancel() {
    const session = sessionRef.current;
    if (!session) return;
    session.discard = true;
    if (session.recorder.state !== "inactive") session.recorder.stop();
    close(session);
    setState("idle");
    setSeconds(0);
    setLevels([]);
    setLimitReached(false);
  }

  async function transcribe(blob: Blob, duration: number) {
    const form = new FormData();
    form.append("audio", blob, `voz.${blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm"}`);
    form.append("seconds", String(Math.round(duration)));
    const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
    const body = (await res.json().catch(() => ({}))) as { jobId?: string; error?: string };
    if (!res.ok || !body.jobId) throw new Error(body.error ?? FAILED);
    const deadline = Date.now() + POLL_LIMIT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      const poll = await fetch(`/api/voice/transcribe?id=${encodeURIComponent(body.jobId)}`);
      const result = (await poll.json().catch(() => ({}))) as { status?: string; text?: string; error?: string };
      if (result.status === "pending") continue;
      if (!poll.ok || !result.text) throw new Error(result.error ?? FAILED);
      return result.text;
    }
    throw new Error(FAILED);
  }

  function send() {
    const session = sessionRef.current;
    if (!session || session.recorder.state === "inactive") return;
    const duration = elapsed(session);
    session.recorder.onstop = () => {
      close(session);
      if (session.discard) return;
      setState("transcribing");
      setLimitReached(false);
      transcribe(new Blob(session.chunks, { type: session.recorder.mimeType || "audio/webm" }), duration)
        .then((text) => onTextRef.current(text))
        .catch((err) => setError(err instanceof TypeError ? OFFLINE : (err as Error).message))
        .finally(() => {
          setState("idle");
          setSeconds(0);
          setLevels([]);
        });
    };
    session.recorder.stop();
  }

  return { supported, state, seconds, maxSeconds: MAX_SECONDS, levels, limitReached, error, start, pause, resume, cancel, send };
}
