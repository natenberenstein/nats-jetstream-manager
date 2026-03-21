import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';
import { ConnectionProvider } from '@/contexts/ConnectionContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { QueryProvider } from '@/components/QueryProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'NATS JetStream Manager',
  description: 'Manage NATS JetStream clusters with ease',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider>
          <QueryProvider>
            <ConnectionProvider>
              {children}
              <Toaster position="bottom-right" richColors closeButton />
            </ConnectionProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
