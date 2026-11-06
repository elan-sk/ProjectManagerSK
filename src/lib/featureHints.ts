// Novedades de la app: cada una resalta un elemento la primera vez que la persona entra a esa pantalla
// (FeatureHints.tsx, con driver.js). Se ve una sola vez por persona (tabla UserFeatureHint) y deja de
// mostrarse sola a los HINT_LIFETIME_DAYS de publicada (pedido del usuario: hace muchos cambios).
// Para anunciar algo nuevo: agregar una entrada y poner `data-feature-hint="<id>"` en el elemento.
// Sin "use client": la lee el layout (servidor) y el componente (navegador).

export type FeatureHint = {
  /** Único y estable: es lo que queda guardado como visto. */
  id: string;
  /** Pantalla donde se muestra: pathname exacto, o con «*» para un tramo variable (ej. «/projects/*»). */
  path: string;
  title: string;
  description: string;
  /** Fecha de publicación (AAAA-MM-DD, hora de Colombia). */
  publishedAt: string;
};

export const HINT_LIFETIME_DAYS = 7;

export function hintMatchesPath(pattern: string, pathname: string): boolean {
  const a = pattern.split("/");
  const b = pathname.split("/");
  return a.length === b.length && a.every((seg, i) => seg === "*" || seg === b[i]);
}

export const FEATURE_HINTS: FeatureHint[] = [
  {
    id: "task-assistant-create",
    path: "/projects/*",
    title: "Crear la tarea con el asistente",
    description: "El asistente pregunta qué hay que hacer, deduce el tipo de tarea y propone responsable, fechas y checklist; la tarea se crea con una sola confirmación.",
    publishedAt: "2026-11-06",
  },
  {
    id: "task-assistant-complete",
    path: "/projects/*/tasks/*",
    title: "Completar la tarea con el asistente",
    description: "El asistente dice qué le falta a la tarea (insumos, descripción, checklist, responsable o pruebas) y lo completa pregunta por pregunta.",
    publishedAt: "2026-11-06",
  },
  {
    id: "project-assistant-complete",
    path: "/projects/*",
    title: "Completar el proyecto con el asistente",
    description: "El asistente revisa lo que le falta al proyecto (equipo, objetivos, fases o tareas) y lo completa conversando, con una confirmación por bloque.",
    publishedAt: "2026-11-06",
  },
  {
    id: "project-assistant",
    path: "/projects",
    title: "Crear proyectos con el asistente",
    description: "El asistente pregunta paso a paso por el proyecto, el cliente, el equipo y las tareas, y crea todo después de cada confirmación.",
    publishedAt: "2026-11-06",
  },
  {
    id: "company-clients",
    path: "/company",
    title: "Clientes de la empresa",
    description: "Cada cliente tiene su ficha con contacto y perfil, y se reutiliza en todos sus proyectos.",
    publishedAt: "2026-11-06",
  },
  {
    id: "company-nav",
    path: "/projects",
    title: "Nuevo: Empresa",
    description: "Sección para administradores con el perfil de la empresa, su identidad para los documentos y un asistente que pregunta por ella, para que los consejos de la IA se ajusten a la empresa.",
    publishedAt: "2026-11-05",
  },
  {
    id: "agenda-credentials-page",
    path: "/agenda",
    title: "Nuevo: Contraseñas",
    description: "Todas las contraseñas a las que tiene acceso, en un solo lugar, para copiarlas o editarlas.",
    publishedAt: "2026-10-23",
  },
  {
    id: "credentials-add",
    path: "/credentials",
    title: "Nuevo: Agregar contraseñas",
    description: "Se crea eligiendo el proyecto al que pertenece. En cada proyecto, el botón + la agrega directamente ahí.",
    publishedAt: "2026-10-23",
  },
  {
    id: "bot-whatsapp-chat-toggle",
    path: "/settings/bot-whatsapp",
    title: "Nuevo: el asistente responde por WhatsApp",
    description: "Al marcar esta casilla, el asistente contesta los mensajes, documentos y notas de voz que el equipo le escribe a su número de WhatsApp.",
    publishedAt: "2026-10-28",
  },
  {
    id: "whatsapp-cloud-connection",
    path: "/settings/bot-whatsapp",
    title: "Nuevo: conexión oficial de WhatsApp",
    description: "Además del código QR, WhatsApp puede conectarse con la API oficial de Meta, que no corre riesgo de bloqueo. El QR queda de respaldo.",
    publishedAt: "2026-10-30",
  },
  {
    id: "bot-group-mentions",
    path: "/settings/bot-whatsapp",
    title: "Nuevo: pedidos al asistente desde el grupo",
    description: "Con esta casilla, el asistente atiende a quien lo menciona en el grupo del proyecto y publica ahí el resultado con su link.",
    publishedAt: "2026-10-30",
  },
];

/** Novedades vigentes: publicadas hace menos de HINT_LIFETIME_DAYS días. */
export function activeFeatureHints(now = new Date()) {
  return FEATURE_HINTS.filter((h) => {
    const published = new Date(`${h.publishedAt}T00:00:00-05:00`).getTime();
    return now.getTime() >= published && now.getTime() < published + HINT_LIFETIME_DAYS * 86_400_000;
  });
}
