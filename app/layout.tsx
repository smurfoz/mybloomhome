import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { currentUser } from '../lib/session.ts';
import { LogoutButton } from '../components/LogoutButton.tsx';

export const metadata: Metadata = { title: 'Site Store', description: 'Construction site store: receive, issue and track stock with QR codes' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#c2410c' };

const links = [
  ['/', 'Dashboard'], ['/receive', 'Receive'], ['/issue', 'Issue'], ['/items', 'Items'],
  ['/documents', 'Documents'], ['/labels', 'Labels'], ['/stores', 'Stores'],
] as const;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        {user && (
          <header className="no-print sticky top-0 z-10 border-b border-line bg-white/95 backdrop-blur">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
              <Link href="/" className="mr-2 flex items-center gap-2 font-bold">
                <span className="grid h-8 w-8 place-items-center rounded-md bg-brand text-white" aria-hidden>▦</span>
                Site Store
              </Link>
              <nav className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto pb-1 sm:order-none sm:w-auto sm:pb-0">
                {links.map(([href, label]) => (
                  <Link key={href} href={href} className="whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-medium text-muted hover:bg-page hover:text-ink">{label}</Link>
                ))}
              </nav>
              <div className="ml-auto flex items-center gap-3 text-sm">
                <span className="hidden text-muted md:inline">{user.name} · {user.role}</span>
                <LogoutButton />
              </div>
            </div>
          </header>
        )}
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
