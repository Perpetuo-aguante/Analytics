import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { getCategories } from "@/lib/categories";
import { buildCorpusModel, getTextCorpus } from "@/lib/texts";
import { CompareForm, type CorpusPoint } from "./compare-form";

export const dynamic = "force-dynamic";

export default async function CompararPage() {
  const [rows, categories] = await Promise.all([getTextCorpus(), getCategories()]);
  const model = buildCorpusModel(rows, categories);
  const coordsById = new Map(model.map?.ids.map((id, i) => [id, model.map!.coords[i]]) ?? []);

  const points: CorpusPoint[] = [];
  for (const row of rows) {
    const category = model.categoryById.get(row.post_id);
    if (!category) continue;
    points.push({
      id: row.post_id,
      slug: row.slug,
      title: row.title,
      category,
      lexico: coordsById.get(row.post_id) ?? null,
      reading: row.reading,
    });
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <Link href="/textos" className="text-sm text-ink-muted hover:underline">
        ← Textos
      </Link>
      <div className="mt-4">
        <PageHeader
          title="Comparar un texto nuevo"
          description="Pega un borrador (o sube su .txt) y mira a qué textos de Perpetuo se parece, dónde cae en el mapa y qué estilo y sentimiento tendría, estimados a partir de sus vecinos más parecidos. El texto no se guarda."
          scope={`${rows.length.toLocaleString("es")} textos para comparar`}
        />
      </div>
      <CompareForm
        points={points}
        categories={categories}
        axes={
          model.map
            ? model.map.axes.map((a) => ({
                low: a.negative.slice(0, 3).join(", "),
                high: a.positive.slice(0, 3).join(", "),
                explained: a.explained,
              }))
            : null
        }
      />
    </main>
  );
}
