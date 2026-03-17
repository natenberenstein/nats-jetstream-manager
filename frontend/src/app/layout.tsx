import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';
import { ConnectionProvider } from '@/contexts/ConnectionContext';
import { QueryProvider } from '@/components/QueryProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'NATS JetStream Manager',
  description: 'Manage NATS JetStream clusters with ease',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <QueryProvider>
          <ConnectionProvider>
            {children}
            <Toaster position="bottom-right" richColors closeButton />
          </ConnectionProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
