import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Consultorio · Dr. José I. Ormaechea",
    short_name: "Ormaechea",
    description: "Agenda, pacientes, cobros, gastos y costos del consultorio.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f3ee",
    theme_color: "#f6f3ee",
    lang: "es-AR",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
