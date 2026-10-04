import { z } from "zod";
import { DEFAULT_COLORS } from "@/components/ProjectIcon";

// Entrada de una categoría de etiqueta por API (POST/PATCH /api/v1/tags/categories): la acción de la app recibe FormData.
export const categorySchema = z.object({
  name: z.string().trim().min(1),
  colorHex: z.string().refine((c) => DEFAULT_COLORS.includes(c), `colorHex debe ser uno de: ${DEFAULT_COLORS.join(", ")}`),
  emoji: z.string().trim().nullable().optional(),
});

export function categoryForm(data: z.infer<typeof categorySchema>) {
  const fd = new FormData();
  fd.set("name", data.name);
  fd.set("colorHex", data.colorHex);
  if (data.emoji) fd.set("emoji", data.emoji);
  return fd;
}
