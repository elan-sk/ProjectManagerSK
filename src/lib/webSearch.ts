import type Anthropic from "@anthropic-ai/sdk";
import type { BotProvider } from "@/lib/botProviders";

export const WEB_SEARCH_LIMIT = 5;
const PROVIDERS_WITH_SEARCH: BotProvider[] = ["anthropic", "deepseek"];

export function providerHasWebSearch(provider: BotProvider): boolean {
  return PROVIDERS_WITH_SEARCH.includes(provider);
}

export function webSearchTool(provider: BotProvider, used: number): Anthropic.WebSearchTool20250305 | null {
  const left = WEB_SEARCH_LIMIT - used;
  if (!providerHasWebSearch(provider) || left <= 0) return null;
  return { type: "web_search_20250305", name: "web_search", max_uses: left };
}

export function countWebSearches(contents: string[]): number {
  return contents.reduce((n, c) => n + (c.match(/"type":"server_tool_use"/g)?.length ?? 0), 0);
}
