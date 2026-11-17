import type { Metadata, Viewport } from "next";
import { PublicBooking } from "@/components/booking/public-booking";

export const metadata: Metadata = {
  title: "Reservá tu turno",
  description: "Elegí día y horario para tu consulta con el Dr. Ignacio Ormaechea · Cirugía Plástica.",
  openGraph: {
    title: "Reservá tu turno · Dr. Ignacio Ormaechea",
    description: "Elegí día y horario para tu consulta. Te confirmamos por WhatsApp.",
    type: "website",
    locale: "es_AR",
  },
};

export const viewport: Viewport = {
  themeColor: "#1c1714",
};

// Portal de pacientes: público, sin sesión. Los datos llegan por funciones RPC
// que solo exponen tratamientos habilitados y horarios libres.
export default function ReservarPage() {
  return <PublicBooking />;
}
