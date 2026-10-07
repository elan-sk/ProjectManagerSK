import { Avatar } from "@/components/Avatar";

/**
 * Lista de personas con casillas (avatar + nombre). La comparten la selección de asignados/revisores
 * de una tarea y la visibilidad «Personas concretas» de una credencial, para que se vean y funcionen
 * igual. Controlada (`selectedIds` + `onToggle`) o no controlada (`defaultSelectedIds`, viaja en el
 * <form> con `fieldName`).
 */
export function UserCheckList({
  users,
  fieldName,
  defaultSelectedIds,
  selectedIds,
  onToggle,
}: {
  users: { id: string; name: string; avatarUrl?: string | null }[];
  fieldName?: string;
  defaultSelectedIds?: string[];
  selectedIds?: string[];
  onToggle?: (userId: string, checked: boolean) => void;
}) {
  return (
    <div className="max-h-56 space-y-0.5 overflow-x-hidden overflow-y-auto">
      {users.map((u) => (
        <label key={u.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
          <input
            type="checkbox"
            name={fieldName}
            value={u.id}
            {...(selectedIds
              ? { checked: selectedIds.includes(u.id), onChange: (e: React.ChangeEvent<HTMLInputElement>) => onToggle?.(u.id, e.target.checked) }
              : { defaultChecked: defaultSelectedIds?.includes(u.id) })}
            className="rounded border-slate-300"
          />
          <Avatar name={u.name} avatarUrl={u.avatarUrl} size="h-6 w-6 text-[10px]" />
          {u.name}
        </label>
      ))}
    </div>
  );
}
