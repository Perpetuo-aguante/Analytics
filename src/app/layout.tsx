import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";

// La letra es Neue Montreal, con Helvetica Neue de apoyo (ver globals.css):
// no se descarga ninguna fuente, como pide el sistema de Perpetuo mientras
// la licencia no esté en el repo.

export const metadata: Metadata = {
  title: "Perpetuo · Analítica",
  description: "Analítica semanal de las publicaciones de Perpetuo.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className="h-full" data-scroll-behavior="smooth">
      <body className="min-h-full flex flex-col">
        <Nav />
        {children}
      </body>
    </html>
  );
}
