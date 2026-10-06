"use client";

import { useCallback } from "react";
import { useToast } from "@/components/Toast";
import { alreadyLoadedMessage } from "@/lib/duplicateNotice";

/** Spec 001: aviso neutro (no error) con los archivos que ya estaban cargados en esa sección. */
export function useDuplicateNotice() {
  const showToast = useToast();
  return useCallback((names: string[]) => {
    if (names.length > 0) showToast(alreadyLoadedMessage(names), "info");
  }, [showToast]);
}
