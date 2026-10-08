import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Superadmin | Emparejao",
  description: "Control operativo de salas y parejas de Emparejao.",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
