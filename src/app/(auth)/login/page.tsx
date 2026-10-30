import type { Metadata } from "next";
import { LoginView } from "@/components/views/login";

export const metadata: Metadata = { title: "Ingresar" };

export default function LoginPage() {
  return <LoginView />;
}
