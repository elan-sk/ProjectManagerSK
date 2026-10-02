import { resolveClaudeLink } from "@/lib/apiAuth";
import { GET as getProject } from "@/app/api/v1/projects/[id]/route";
import { GET as getTask } from "@/app/api/v1/tasks/[id]/route";

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
  let context = "";
  if (link.taskId) {
    const res = await getTask(authed, { params: Promise.resolve({ id: link.taskId }) });
    context = `## Tarea de contexto (GET /api/v1/tasks/${link.taskId})\n\n\`\`\`json\n${JSON.stringify(await res.json(), null, 2)}\n\`\`\``;
  } else if (link.projectId) {
    const res = await getProject(authed, { params: Promise.resolve({ id: link.projectId }) });
    context = `## Proyecto de contexto (GET /api/v1/projects/${link.projectId})\n\n\`\`\`json\n${JSON.stringify(await res.json(), null, 2)}\n\`\`\``;
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
