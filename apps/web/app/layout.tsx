import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Castify',
  description: 'Multi-tenant P2P video streaming platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="en">
      <body className="bg-black text-white antialiased">{children}</body>
    </html>
  );
}
