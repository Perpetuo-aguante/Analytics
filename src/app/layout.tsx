import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";

// Bricolage Grotesque para títulos y cifras (variable: peso, ancho y tamaño
// óptico, para poder angostarla en los titulares grandes) e Instrument Sans
// para el texto. Ver --font-display / --font-sans en globals.css.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: "variable",
  axes: ["opsz", "wdth"],
  variable: "--font-bricolage",
  display: "swap",
});

const instrument = Instrument_Sans({
  subsets: ["latin"],
  weight: "variable",
  axes: ["wdth"],
  variable: "--font-instrument",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Perpetuo · Analítica",
  description: "Analítica semanal de las publicaciones de Perpetuo.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`h-full ${bricolage.variable} ${instrument.variable}`} data-scroll-behavior="smooth">
      <body className="min-h-full flex flex-col">
        <Nav />
        {children}
      </body>
    </html>
  );
}
