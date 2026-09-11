import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Backdrop } from "@/components/backdrop";

// Poppins es toda la voz tipográfica de la app: geométrica y de peso alto en
// los títulos, regular en el cuerpo. Los números usan la mono del sistema
// (--font-mono) para que las columnas alineen sin descargar otra fuente.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Perpetuo · Analítica",
  description: "Analítica semanal de las publicaciones de Perpetuo.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`h-full ${poppins.variable}`} data-scroll-behavior="smooth">
      <body className="min-h-full flex flex-col">
        <Backdrop />
        <Nav />
        {children}
      </body>
    </html>
  );
}
