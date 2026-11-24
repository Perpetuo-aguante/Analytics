import { getSessionStatus } from "@/lib/session";
import { getCategories } from "@/lib/categories";
import { LoginForm } from "./login-form";
import { Uploader } from "./uploader";
import { ManageUploads } from "./manage-uploads";
import { DuplicateFinder } from "./duplicate-finder";
import { CategoryManager } from "./category-manager";
import { SubscribersUploader } from "./subscribers-uploader";
import { SubscribersManageUploads } from "./subscribers-manage-uploads";
import { SignOutButton } from "./sign-out-button";
import { IngestRuns } from "./ingest-runs";

export default async function SubirPage() {
  const session = await getSessionStatus();

  if (session.state === "signed-out") {
    return (
      <main className="mx-auto max-w-md px-6 py-12">
        <h1 className="mb-6 font-display text-2xl font-semibold">Cargar métricas semanales</h1>
        <LoginForm />
      </main>
    );
  }

  if (session.state === "not-allowed") {
    return (
      <main className="mx-auto max-w-md px-6 py-12">
        <h1 className="mb-6 font-display text-2xl font-semibold">Cargar métricas semanales</h1>
        <p className="mb-6 text-sm text-ink-muted">
          Entraste como <strong>{session.email}</strong>, pero esta cuenta no tiene permiso para cargar datos. Pide
          que agreguen tu correo a ADMIN_EMAILS.
        </p>
        <SignOutButton />
      </main>
    );
  }

  const categories = await getCategories();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-10 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Cargar métricas semanales</h1>
        <SignOutButton />
      </div>
      <IngestRuns />
      <hr className="my-12 border-line" />
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
