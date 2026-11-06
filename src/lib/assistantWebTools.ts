import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { fetchPageText } from "@/lib/pageTitle";
import { getBotConnection } from "@/lib/botSettings";
import { providerHasWebSearch, WEB_SEARCH_LIMIT } from "@/lib/webSearch";

export const READ_WEB_PAGE_TOOL: Anthropic.Tool = {
  name: "read_web_page",
  description: "Lee el texto de una página web pública (sitio de la empresa o del cliente, una noticia). Las redes que piden iniciar sesión (Instagram, Facebook, LinkedIn, TikTok) normalmente no se pueden leer.",
  input_schema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
};

export async function runReadWebPage(input: unknown): Promise<string> {
  const parsed = z.object({ url: z.string().min(3) }).safeParse(input);
  if (!parsed.success) return JSON.stringify({ error: "Falta la dirección de la página." });
  const page = await fetchPageText(parsed.data.url);
  return JSON.stringify(page.ok ? { url: page.url, title: page.title, text: page.text } : { error: page.error });
}

export async function webResearchRules(subject: string): Promise<string> {
  const conn = await getBotConnection().catch(() => null);
  const search = conn && providerHasWebSearch(conn.provider);
  return `Investigación en internet (${subject}):
- Si la persona pasa la página web o las redes, leelas con read_web_page. Si una no se puede leer, decilo en una frase, pedí que pegue el texto o una captura y seguí.
${
  search
    ? `- Además podés buscar en internet con web_search (máximo ${WEB_SEARCH_LIMIT} búsquedas en toda la conversación) con lo que tengas (nombre, ciudad, sector, links), aunque no te pasen links: quién es, a qué se dedica, tamaño, presencia digital, y tendencias o competencia del sector.`
    : `- El servicio de IA conectado no tiene buscador: solo podés leer los links que te pasen. Decilo UNA vez al ofrecer la investigación.`
}
- Orientá la investigación por lo que la empresa quiere lograr (temas «Qué quiere revisar con la aplicación» y «Consejos que espera» del perfil de la empresa): buscá lo que sirva para esos consejos.
- Mostrá lo encontrado resumido, con la página de donde salió cada dato, y guardalo SOLO si la persona lo confirma. Nunca guardes como cierto un dato sin fuente; si dudás de que sea la misma empresa, preguntá.`;
}
