// Novedades de la app: cada una resalta un elemento la primera vez que la persona entra a esa pantalla
// (FeatureHints.tsx, con driver.js). Se ve una sola vez por persona (tabla UserFeatureHint) y deja de
// mostrarse sola a los HINT_LIFETIME_DAYS de publicada (pedido del usuario: hace muchos cambios).
// Para anunciar algo nuevo: agregar una entrada y poner `data-feature-hint="<id>"` en el elemento.
// Sin "use client": la lee el layout (servidor) y el componente (navegador).

export type FeatureHint = {
  /** Único y estable: es lo que queda guardado como visto. */
  id: string;
  /** Pantalla donde se muestra (pathname exacto). */
  path: string;
  title: string;
  description: string;
  /** Fecha de publicación (AAAA-MM-DD, hora de Colombia). */
  publishedAt: string;
};

export const HINT_LIFETIME_DAYS = 7;

export const FEATURE_HINTS: FeatureHint[] = [
  {
    id: "agenda-credentials-page",
    path: "/agenda",
    title: "Nuevo: Contraseñas",
    description: "Todas las contraseñas a las que tiene acceso, en un solo lugar, para copiarlas o editarlas.",
    publishedAt: "2026-10-23",
  },
];

/** Novedades vigentes: publicadas hace menos de HINT_LIFETIME_DAYS días. */
export function activeFeatureHints(now = new Date()) {
  return FEATURE_HINTS.filter((h) => {
    const published = new Date(`${h.publishedAt}T00:00:00-05:00`).getTime();
    return now.getTime() >= published && now.getTime() < published + HINT_LIFETIME_DAYS * 86_400_000;
  });
}
