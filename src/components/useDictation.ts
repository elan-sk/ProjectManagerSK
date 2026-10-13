"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<RecognitionResult> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionCtor = new () => Recognition;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// En celulares y tabletas el dictado choca con el micrófono del propio teclado del sistema: ahí no se ofrece.
// Se detecta por sistema, no por tamaño de pantalla; el iPad moderno se presenta como Mac con pantalla táctil.
function isMobileOs() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

const noSubscription = () => () => {};

export function useDictation(onFinal: (spoken: string) => void, lang = "es-CO") {
  const supported = useSyncExternalStore(noSubscription, () => getRecognitionCtor() !== null && !isMobileOs(), () => false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const activeRef = useRef(false);
  const onFinalRef = useRef(onFinal);

  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  function stop() {
    activeRef.current = false;
    setListening(false);
    setInterim("");
    try {
      recognitionRef.current?.stop();
    } catch {
      recognitionRef.current = null;
    }
  }

  function start() {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    setError(null);
    const recognition = new Ctor();
    let processed = 0;
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let pending = "";
      for (let i = processed; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          onFinalRef.current(result[0].transcript);
          processed = i + 1;
        } else pending += result[0].transcript;
      }
      setInterim(pending);
    };
    recognition.onend = () => {
      if (!activeRef.current) return;
      processed = 0;
      try {
        recognition.start();
      } catch {
        stop();
      }
    };
    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      setError(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "El navegador no tiene permiso para usar el micrófono."
          : event.error === "audio-capture"
            ? "No se encontró un micrófono."
            : "No se pudo continuar el dictado."
      );
      stop();
    };
    recognitionRef.current = recognition;
    activeRef.current = true;
    setListening(true);
    try {
      recognition.start();
    } catch {
      setError("No se pudo iniciar el dictado.");
      stop();
    }
  }

  useEffect(() => {
    return () => {
      activeRef.current = false;
      try {
        recognitionRef.current?.stop();
      } catch {
        recognitionRef.current = null;
      }
    };
  }, []);

  return { supported, listening, interim, error, stop, toggle: () => (activeRef.current ? stop() : start()) };
}
