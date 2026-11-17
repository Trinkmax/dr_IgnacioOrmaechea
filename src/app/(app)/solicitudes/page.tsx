import type { Metadata } from "next";
import { BookingRequestsView } from "@/components/views/booking-requests";

// Renderizado en el cliente (ver (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Solicitudes" };

export default function Page() {
  return <BookingRequestsView />;
}
