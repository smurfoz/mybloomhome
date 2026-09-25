import Link from 'next/link';
export default function NotFound() {
  return <div className="card mx-auto mt-10 max-w-md text-center"><h1 className="text-xl font-bold">Not found</h1>
    <p className="mt-2 text-muted">It doesn’t exist, or it belongs to another company.</p>
    <Link href="/" className="btn-secondary mt-4">Dashboard</Link></div>;
}
