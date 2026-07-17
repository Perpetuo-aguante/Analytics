"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <label className="block text-sm text-muted">
        Contraseña
        <input
          type="password"
          name="password"
          required
          autoFocus
          className="mt-1 w-full rounded-full border border-border bg-white/50 px-4 py-2 text-foreground outline-none focus:border-accent"
        />
      </label>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full text-sm">
        {pending ? "Verificando…" : "Entrar"}
      </button>
    </form>
  );
}
