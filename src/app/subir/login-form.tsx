"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

type Mode = "sign-in" | "sign-up";

const inputClass =
  "mt-1 w-full rounded-full border border-line bg-white/50 px-4 py-2 text-ink outline-none focus:border-blue";

// Entrar (o crear la cuenta la primera vez) con Neon Auth. Crear una cuenta
// no da permisos: solo los correos de ADMIN_EMAILS pueden cargar datos.
export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim() || email;

    setPending(true);
    setError(null);
    try {
      const result =
        mode === "sign-in"
          ? await authClient.signIn.email({ email, password })
          : await authClient.signUp.email({ email, password, name });
      if (result.error) {
        setError(describeAuthError(result.error, mode));
        return;
      }
      router.refresh();
    } catch (err) {
      // El SDK de Neon Auth a veces lanza el error HTTP en vez de devolverlo
      // en `result.error`: el código crudo de Better Auth viene en `.error`.
      const thrown = err as { status?: number; code?: string; message?: string; error?: { status?: number; code?: string } };
      if (thrown && (thrown.status || thrown.error)) {
        setError(
          describeAuthError(
            {
              status: thrown.error?.status ?? thrown.status,
              code: thrown.error?.code ?? thrown.code,
              message: thrown.message,
            },
            mode
          )
        );
      } else {
        setError("No se pudo conectar con el servicio de cuentas. Intenta de nuevo.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {mode === "sign-up" && (
        <label className="block text-sm text-ink-muted">
          Nombre
          <input type="text" name="name" autoComplete="name" className={inputClass} />
        </label>
      )}
      <label className="block text-sm text-ink-muted">
        Correo
        <input type="email" name="email" required autoFocus autoComplete="email" className={inputClass} />
      </label>
      <label className="block text-sm text-ink-muted">
        Contraseña
        <input
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          className={inputClass}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary w-full text-sm">
        {pending ? "Verificando…" : mode === "sign-in" ? "Entrar" : "Crear cuenta"}
      </button>
      <button
        type="button"
        onClick={() => {
          setMode(mode === "sign-in" ? "sign-up" : "sign-in");
          setError(null);
        }}
        className="w-full text-sm text-ink-muted hover:text-ink hover:underline"
      >
        {mode === "sign-in" ? "¿Primera vez? Crea tu cuenta" : "Ya tengo cuenta: entrar"}
      </button>
    </form>
  );
}

function describeAuthError(error: { status?: number; code?: string; message?: string }, mode: Mode): string {
  const code = (error.code ?? "").toUpperCase();
  if (code === "INVALID_EMAIL_OR_PASSWORD" || code === "INVALID_CREDENTIALS" || error.status === 401)
    return "Correo o contraseña incorrectos.";
  if (code.startsWith("USER_ALREADY_EXISTS")) return "Ya existe una cuenta con ese correo. Entra con tu contraseña.";
  if (code === "PASSWORD_TOO_SHORT" || code === "WEAK_PASSWORD") return "La contraseña debe tener al menos 8 caracteres.";
  if (error.status === 429) return "Demasiados intentos. Espera un momento y vuelve a intentar.";
  if (error.message) return error.message;
  return mode === "sign-in" ? "No se pudo iniciar sesión." : "No se pudo crear la cuenta.";
}
