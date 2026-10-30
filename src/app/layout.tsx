import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Montserrat } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Títulos y números: sans geométrica en línea con el texto circular del logo.
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: {
    default: "Consultorio · Dr. Ignacio Ormaechea",
    template: "%s · Dr. Ormaechea",
  },
  description: "Agenda, pacientes, cobros, gastos y costos del consultorio de Cirugía Plástica del Dr. Ignacio Ormaechea.",
  applicationName: "Consultorio Ormaechea",
  appleWebApp: { capable: true, title: "Ormaechea", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#f6f3ee",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-AR" className={`${geist.variable} ${geistMono.variable} ${montserrat.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
