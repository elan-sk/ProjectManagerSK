// Sin "use client": lo usan tanto RememberViewState (navegador) como page.tsx (servidor).
/** Nombre de la cookie con la última vista guardada de `storageKey` (ver RememberViewState). */
export const viewCookieName = (storageKey: string) => `pmv_${storageKey.replace(/[^\w-]/g, "_")}`;
