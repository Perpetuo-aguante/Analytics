import { cookies } from "next/headers";
import { isValidSessionCookieValue, SESSION_COOKIE_NAME } from "@/lib/session";
import { getCategories } from "@/lib/categories";
import { LoginForm } from "./login-form";
import { Uploader } from "./uploader";
import { ManageUploads } from "./manage-uploads";
import { DuplicateFinder } from "./duplicate-finder";
import { CategoryManager } from "./category-manager";
import { SubscribersUploader } from "./subscribers-uploader";
import { SubscribersManageUploads } from "./subscribers-manage-uploads";
import { logout } from "./actions";

export default async function SubirPage() {
  const cookieStore = await cookies();
  const authenticated = isValidSessionCookieValue(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  if (!authenticated) {
    return (
      <main className="mx-auto max-w-md px-6 py-12">
        <h1 className="mb-6 font-display text-2xl font-semibold">Cargar métricas semanales</h1>
        <LoginForm />
      </main>
    );
  }

  const categories = await getCategories();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-10 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Cargar métricas semanales</h1>
        <form action={logout}>
          <button className="rounded-full border border-line px-3 py-1.5 text-sm text-ink-muted hover:border-blue hover:text-ink">
            Cerrar sesión
          </button>
        </form>
      </div>
      <CategoryManager initialCategories={categories} />
      <hr className="my-12 border-line" />
      <h2 className="mb-6 font-display text-xl font-semibold">Métricas de posts</h2>
      <Uploader />
      <hr className="my-12 border-line" />
      <ManageUploads />
      <hr className="my-12 border-line" />
      <DuplicateFinder />

      <hr className="my-16 border-line" />

      <h2 className="mb-6 font-display text-xl font-semibold">Suscriptores</h2>
      <SubscribersUploader />
      <hr className="my-12 border-line" />
      <SubscribersManageUploads />
    </main>
  );
}
