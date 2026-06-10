import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Booking.com Channel Manager',
  description: 'Integrazione Booking.com — BAP, R&A, BRS',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
