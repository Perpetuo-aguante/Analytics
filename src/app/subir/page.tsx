import { cookies } from "next/headers";
import { isValidSessionCookieValue, SESSION_COOKIE_NAME } from "@/lib/session";
import { LoginForm } from "./login-form";
import { Uploader } from "./uploader";
import { logout } from "./actions";

export default async function SubirPage() {
  const cookieStore = await cookies();
  const authenticated = isValidSessionCookieValue(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  if (!authenticated) {
    return (
      <main className="mx-auto max-w-md px-6 py-16">
        <h1 className="mb-6 font-serif text-2xl font-semibold">Cargar métricas semanales</h1>
        <LoginForm />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="mb-10 flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold">Cargar métricas semanales</h1>
        <form action={logout}>
          <button className="text-sm text-muted underline">Cerrar sesión</button>
        </form>
      </div>
      <Uploader />
    </main>
  );
}
