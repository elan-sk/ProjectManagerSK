"use client";

import { useTransition } from "react";
import { updateUserRole } from "./actions";
import { ModalTrigger } from "@/components/Modal";
import { Avatar } from "@/components/Avatar";
import { CreateUserForm } from "./CreateUserForm";
import { ResetPasswordForm } from "./ResetPasswordForm";
import { EditUserForm } from "./EditUserForm";

type UserRow = { id: string; name: string; email: string; role: "ADMIN" | "MEMBER"; avatarUrl: string | null };

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

export function UsersAdmin({ users }: { users: UserRow[] }) {
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
          <li key={u.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <Avatar name={u.name} avatarUrl={u.avatarUrl} size="h-8 w-8 text-xs" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{u.name}</p>
                <p className="truncate text-xs text-slate-400">{u.email}</p>
              </div>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              <RoleSelect userId={u.id} role={u.role} />
              <ModalTrigger label="Editar" title={`Editar usuario — ${u.name}`} variant="secondary">
                <EditUserForm userId={u.id} name={u.name} email={u.email} avatarUrl={u.avatarUrl} />
              </ModalTrigger>
              <ModalTrigger label="Restablecer clave" title={`Restablecer contraseña — ${u.name}`} variant="secondary">
                <ResetPasswordForm userId={u.id} />
              </ModalTrigger>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
