import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";

// Fuente para todos los títulos (h1/h2/h3 y el logo de la nav) — ver la
// variable --font-poppins consumida por --font-serif en globals.css.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: "Perpetuo · Analítica",
  description: "Analítica semanal de las publicaciones de Perpetuo.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`h-full ${poppins.variable}`}>
      <body className="min-h-full flex flex-col">
        <Nav />
        {children}
      </body>
    </html>
  );
}
