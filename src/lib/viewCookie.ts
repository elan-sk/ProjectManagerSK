// Sin "use client": lo usan tanto RememberViewState (navegador) como page.tsx (servidor).
/** Nombre de la cookie con la última vista guardada de `storageKey` (ver RememberViewState). */
export const viewCookieName = (storageKey: string) => `pmv_${storageKey.replace(/[^\w-]/g, "_")}`;

/** "1" = el Panorama general y Agenda incluyen las tareas de proyectos ocultos (ver hiddenProjectsPref). */
export const SHOW_HIDDEN_PROJECTS_COOKIE = "pmv_show_hidden_projects";
