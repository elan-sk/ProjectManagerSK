"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateUserRole, deactivateUser, reactivateUser } from "./actions";
import { ModalTrigger } from "@/components/Modal";
import { Avatar } from "@/components/Avatar";
import { useConfirm } from "@/components/Confirm";
import { useToast } from "@/components/Toast";
import { CreateUserForm } from "./CreateUserForm";
import { ResetPasswordForm } from "./ResetPasswordForm";
import { EditUserForm } from "./EditUserForm";

type UserRow = {
  id: string;
  name: string;
  username: string;
  email: string | null;
  role: "ADMIN" | "MEMBER";
  avatarUrl: string | null;
  phone: string | null;
  active: boolean;
};

function RoleSelect({ userId, role }: { userId: string; role: UserRow["role"] }) {
  const [isPending, startTransition] = useTransition();
  return (
    <select
      defaultValue={role}
      disabled={isPending}
      onChange={(e) => {
        const role = e.target.value as UserRow["role"];
        startTransition(async () => {
          await updateUserRole(userId, role);
        });
      }}
      className="rounded-lg border border-slate-300 px-2 py-1 text-xs disabled:opacity-60"
    >
      <option value="MEMBER">Miembro</option>
      <option value="ADMIN">Administrador</option>
    </select>
  );
}

// El botón dice "Eliminar" (así lo entiende el equipo) pero por dentro
// desactiva en vez de borrar de verdad — ver el comentario en
// deactivateUser (actions.ts) sobre por qué un borrado en cascada colgaba
// toda la app. Desactivado: no puede loguearse ni se lo puede asignar a
// nada nuevo — invisible en la práctica para el resto del equipo.
//
// El confirm() se llama AFUERA de useTransition a propósito — ver el
// comentario en ArchiveProjectButton.tsx sobre por qué mezclarlo con una
// transición hacía que el modal nunca llegara a pintarse.
function DeactivateUserButton({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const showToast = useToast();
  const [isPending, setIsPending] = useState(false);

  async function handleDeactivate() {
    const ok = await confirm(`¿Eliminar a "${name}"? No va a poder entrar ni asignársele nada nuevo.`, {
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;

    setIsPending(true);
    const result = await deactivateUser(userId);
    if (!result.ok) {
      setIsPending(false);
      showToast(result.error ?? "No se pudo eliminar el usuario.");
      return;
    }
    showToast(`Se eliminó a ${name}.`, "success");
    router.refresh();
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={handleDeactivate}
      className="flex-shrink-0 text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-60"
    >
      Eliminar
    </button>
  );
}

function ReactivateUserButton({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const showToast = useToast();
  const [isPending, startTransition] = useTransition();

  function handleReactivate() {
    startTransition(async () => {
      const result = await reactivateUser(userId);
      if (!result.ok) {
        showToast(result.error ?? "No se pudo reactivar el usuario.");
        return;
      }
      showToast(`Se reactivó a ${name}.`, "success");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={handleReactivate}
      className="flex-shrink-0 text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-60"
    >
      Reactivar
    </button>
  );
}

export function UsersAdmin({ users, currentUserId }: { users: UserRow[]; currentUserId: string }) {
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-slate-900">Usuarios</h2>
        <ModalTrigger label="+ Crear usuario" title="Crear usuario">
          <CreateUserForm />
        </ModalTrigger>
      </div>

      <ul className="divide-y divide-slate-100">
        {users.map((u) => (
          <li key={u.id} className={`flex items-center justify-between gap-3 py-2.5 ${!u.active ? "opacity-50" : ""}`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <Avatar name={u.name} avatarUrl={u.avatarUrl} size="h-8 w-8 text-xs" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {u.name}
                  {!u.active && <span className="ml-1.5 text-xs font-normal text-slate-400">(eliminado)</span>}
                </p>
                <p className="truncate text-xs text-slate-400">
                  @{u.username}
                  {u.email && <span className="text-slate-300"> · {u.email}</span>}
                </p>
              </div>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              {u.active ? (
                <>
                  <RoleSelect userId={u.id} role={u.role} />
                  <ModalTrigger label="Editar" title={`Editar usuario — ${u.name}`} variant="secondary">
                    <EditUserForm userId={u.id} name={u.name} username={u.username} email={u.email} phone={u.phone} avatarUrl={u.avatarUrl} />
                  </ModalTrigger>
                  <ModalTrigger label="Restablecer clave" title={`Restablecer contraseña — ${u.name}`} variant="secondary">
                    <ResetPasswordForm userId={u.id} />
                  </ModalTrigger>
                  {u.id !== currentUserId && (
                    <div className="ml-1.5 border-l border-slate-200 pl-2.5">
                      <DeactivateUserButton userId={u.id} name={u.name} />
                    </div>
                  )}
                </>
              ) : (
                <ReactivateUserButton userId={u.id} name={u.name} />
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
