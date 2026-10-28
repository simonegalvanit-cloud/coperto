import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

// Self-hosted at build time, so guests' browsers never contact Google (GDPR).
const sans = Schibsted_Grotesk({ variable: "--font-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Coperto", template: "%s · Coperto" },
  description: "Prenotazioni e gestione sala per ristoranti italiani.",
};

export const viewport: Viewport = { themeColor: "#dde2da" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" className={sans.variable}>
      <body>{children}</body>
    </html>
  );
}
