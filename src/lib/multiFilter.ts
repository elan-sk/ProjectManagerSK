export type MultiFilter = { include: string[]; exclude: string[] };

const HIDE_PREFIX = "!";

export function parseMultiFilter(raw: string | undefined | null): MultiFilter {
  const include: string[] = [];
  const exclude: string[] = [];
  for (const part of (raw ?? "").split(",")) {
    const v = part.trim();
    if (!v) continue;
    if (v.startsWith(HIDE_PREFIX)) {
      const id = v.slice(HIDE_PREFIX.length);
      if (id && !exclude.includes(id)) exclude.push(id);
    } else if (!include.includes(v)) {
      include.push(v);
    }
  }
  return { include, exclude: exclude.filter((id) => !include.includes(id)) };
}

export function serializeMultiFilter({ include, exclude }: MultiFilter): string | undefined {
  const parts = [...include, ...exclude.map((id) => `${HIDE_PREFIX}${id}`)];
  return parts.length > 0 ? parts.join(",") : undefined;
}

export function matchesMultiFilter(raw: string | undefined | null, test: (value: string) => boolean): boolean {
  const { include, exclude } = parseMultiFilter(raw);
  return (include.length === 0 || include.some(test)) && !exclude.some(test);
}

export function multiFilterIncludes(raw: string | undefined | null, id: string): boolean {
  return parseMultiFilter(raw).include.includes(id);
}

export function singleIncluded(raw: string | undefined | null): string | undefined {
  const { include, exclude } = parseMultiFilter(raw);
  return include.length === 1 && exclude.length === 0 ? include[0] : undefined;
}

export function pruneMultiFilter(raw: string | undefined | null, isKnown: (id: string) => boolean): string | undefined {
  const { include, exclude } = parseMultiFilter(raw);
  return serializeMultiFilter({ include: include.filter(isKnown), exclude: exclude.filter(isKnown) });
}
