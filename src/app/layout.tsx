import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Olumba Quality | CRM',
  description: 'CRM for Olumba Quality Construction Consultancy — sales pipeline, projects, and quality inspections.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
