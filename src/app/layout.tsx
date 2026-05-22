import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BoxMaker',
  description: 'Parametric 3D-printable enclosure designer',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
