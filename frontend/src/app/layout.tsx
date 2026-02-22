import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ConnectionProvider } from "@/contexts/ConnectionContext";
import { QueryProvider } from "@/components/QueryProvider";
import { AuthProvider } from "@/contexts/AuthContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "NATS JetStream Manager",
  description: "Manage NATS JetStream clusters with ease",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <QueryProvider>
          <AuthProvider>
            <ConnectionProvider>
              {children}
            </ConnectionProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
