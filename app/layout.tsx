import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { APP_CONFIG } from "../lib/config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const nombreNegocio = APP_CONFIG.nombreNegocio || "Pégate Ahí";

export const metadata: Metadata = {
  metadataBase: new URL("https://pegate-ahi.vercel.app"),
  title: `${nombreNegocio} · Turnos en Vivo y Citas`,
  description:
    "Toma tu turno en la fila del día o agenda tu cita en la barbería sin esperas.",
  openGraph: {
    title: `${nombreNegocio} · Turnos en Vivo y Citas`,
    description:
      "Toma tu turno en la fila del día o agenda tu cita en la barbería sin esperas.",
    url: "https://pegate-ahi.vercel.app",
    siteName: nombreNegocio,
    locale: "es_VE",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
