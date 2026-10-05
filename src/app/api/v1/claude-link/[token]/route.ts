import { resolveClaudeLink } from "@/lib/apiAuth";
import { GET as getProject } from "@/app/api/v1/projects/[id]/route";
import { GET as getProjectThreads } from "@/app/api/v1/projects/[id]/threads/route";
import { GET as getTask } from "@/app/api/v1/tasks/[id]/route";
import { GET as getTaskDesign } from "@/app/api/v1/tasks/[id]/design/route";
import { GET as getTaskThreads } from "@/app/api/v1/tasks/[id]/threads/route";

// Link del botón "Conectar IA" (ver createClaudeLinkToken). Responde texto
// para que lo lea el propio Claude: sirve tanto a un chat de claude.ai (que
// solo puede ABRIR el link: lectura, y reabrirlo trae el estado actualizado)
// como a Claude Code (que además usa el mismo token como credencial de la
// API, con los permisos de la persona). Se puede abrir las veces que haga
// falta mientras siga vigente; si no, 410.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await resolveClaudeLink(token);
  if (!link) {
    return text(
      "Este link de ProjectManagerSK ya no está activo: la tarea se completó, pasaron 7 días sin usarlo, " +
        "se desactivó o se reemplazó por uno más nuevo. La persona tiene que generar otro con el botón \"Conectar IA\" de la app.",
      410,
    );
  }

  const base = process.env.NEXTAUTH_URL ?? new URL(request.url).origin;

  // Mismo GET de la API con este token — mismos permisos de visibilidad
  // (proyectos ocultos, etc.) que cualquier otro llamado.
  const authed = new Request(request.url, { headers: { authorization: `Bearer ${token}` } });
  // Rutas /uploads/… absolutas: un chat web solo puede abrir links completos
  // (los archivos se sirven sin sesión, ver app/uploads/[name]/route.ts).
  const section = async (title: string, res: Response) =>
    `## ${title}\n\n\`\`\`json\n${JSON.stringify(await res.json(), null, 2).replace(/(?<![\w/.-])\/uploads\//g, `${base}/uploads/`)}\n\`\`\``;
  let context = "";
  if (link.taskId) {
    // Toda la tarea: datos base + insumos/evidencias, el diseño (cambios de un
    // Ajuste con antes/después/insumos, rondas de Prueba/Aceptación) y los hilos.
    const p = { params: Promise.resolve({ id: link.taskId }) };
    context = (
      await Promise.all([
        section(`Tarea de contexto (GET /api/v1/tasks/${link.taskId})`, await getTask(authed, p)),
        section(`Cambios, rondas y adjuntos (GET /api/v1/tasks/${link.taskId}/design)`, await getTaskDesign(authed, p)),
        section(`Hilos y comentarios (GET /api/v1/tasks/${link.taskId}/threads)`, await getTaskThreads(authed, p)),
      ])
    ).join("\n\n");
  } else if (link.projectId) {
    // Proyecto con su definición, adjuntos y links, y sus hilos. Los archivos de
    // cada tarea se leen con GET /tasks/:id, /design y /threads de esa tarea.
    const p = { params: Promise.resolve({ id: link.projectId }) };
    context = (
      await Promise.all([
        section(`Proyecto de contexto (GET /api/v1/projects/${link.projectId})`, await getProject(authed, p)),
        section(`Hilos y comentarios del proyecto (GET /api/v1/projects/${link.projectId}/threads)`, await getProjectThreads(authed, p)),
      ])
    ).join("\n\n");
  }

  const lifetime = link.taskId
    ? "hasta que la tarea se complete, se desactive desde la app o pasen 7 días sin usarlo"
    : "hasta que se desactive desde la app o pasen 7 días sin usarlo";

  return text(`# Conexión con ProjectManagerSK

Conexión a nombre de **${link.user.name}** (@${link.user.username}, rol ${link.user.role}), con sus mismos permisos.

## API

- URL base: ${base}/api/v1
- Encabezado para cada llamado: \`Authorization: Bearer ${token}\`
- Vigencia: ${lifetime}. Cada uso reinicia los 7 días.

Si se puede hacer llamados HTTP con encabezados (Claude Code, curl), se puede trabajar con la API: consultar y modificar proyectos, tareas, checklist, comentarios, etc. Si existe la skill \`project-manager-sk\` o \`pmsk\`, usarla como guía de los endpoints y de las reglas (fechas, dependencias). Si solo se puede abrir links (chat web), usar el contexto de abajo como lectura; volver a abrir este mismo link trae el estado actualizado.

${context}
`);
}

function text(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}
