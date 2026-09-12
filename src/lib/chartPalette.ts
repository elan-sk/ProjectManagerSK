// Paleta cíclica para distribuciones categóricas de tamaño variable
// (categorías de error, tipo de corrección, etc.) — DonutChart necesita
// colorClass + colorHex por dato y esas listas no tienen un color fijo de
// antemano como sí lo tienen estado/riesgo.
const PALETTE = [
  { colorClass: "bg-red-500", colorHex: "#ef4444" },
  { colorClass: "bg-amber-500", colorHex: "#f59e0b" },
  { colorClass: "bg-blue-500", colorHex: "#3b82f6" },
  { colorClass: "bg-emerald-500", colorHex: "#10b981" },
  { colorClass: "bg-purple-500", colorHex: "#a855f7" },
  { colorClass: "bg-pink-500", colorHex: "#ec4899" },
  { colorClass: "bg-cyan-500", colorHex: "#06b6d4" },
  { colorClass: "bg-orange-500", colorHex: "#f97316" },
  { colorClass: "bg-indigo-500", colorHex: "#6366f1" },
  { colorClass: "bg-teal-500", colorHex: "#14b8a6" },
];

export function toDonutData(items: { category: string; count: number }[]) {
  return items.map((item, i) => ({
    label: item.category,
    value: item.count,
    ...PALETTE[i % PALETTE.length],
  }));
}
