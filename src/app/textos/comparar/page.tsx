import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { getCategories } from "@/lib/categories";
import { getCompassCorpus } from "@/lib/compass";
import { matchPostType } from "@/lib/post-types";
import type { TextMapDatum } from "@/components/text-map";
import { CompareForm } from "./compare-form";

export const dynamic = "force-dynamic";

export default async function CompararPage() {
  const [rows, categories] = await Promise.all([getCompassCorpus(), getCategories()]);
  const points: TextMapDatum[] = [];
  for (const row of rows) {
    const category = matchPostType(row.post_type, categories);
    if (category) points.push({ id: row.post_id, slug: row.slug, title: row.title, category, x: row.compass_x / 100, y: row.compass_y / 100 });
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <Link href="/textos" className="text-sm text-ink-muted hover:underline">
        ← Compass editorial
      </Link>
      <div className="mt-4">
        <PageHeader
        personaje="interrogacion-libreta"
          title="Comparar un texto nuevo"
          description="Pega un borrador (o sube su .txt) y mira a qué textos de Perpetuo se parece por vocabulario y dónde caería en el compass, estimado a partir de esos vecinos. Es instantáneo, no usa LLM y no se guarda nada."
          scope={`${rows.length.toLocaleString("es")} posts con lectura para comparar`}
        />
      </div>
      <CompareForm points={points} categories={categories} />
    </main>
  );
}
