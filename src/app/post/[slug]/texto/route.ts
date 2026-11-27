import { getPostBySlug } from "@/lib/queries";
import { getPostText } from "@/lib/texts";
import { isAdmin } from "@/lib/session";

// GET /post/[slug]/texto — descarga el texto completo del post como .txt.
// Solo para admins: el resto de la ficha es pública, pero el texto entero
// puede ser contenido de pago en Substack.
export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  if (!(await isAdmin())) return new Response("Inicia sesión en /subir para descargar el texto.", { status: 401 });
  const { slug } = await ctx.params;
  const post = await getPostBySlug(slug);
  const text = post ? await getPostText(post.id) : null;
  if (!post || !text) return new Response("No hay texto para este post.", { status: 404 });
  return new Response(`${post.title}\n\n${text.body}\n`, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${post.slug}.txt"`,
    },
  });
}
