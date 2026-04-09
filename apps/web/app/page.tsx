export default function RootPage(): React.JSX.Element {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 text-center px-8">
      <h1 className="text-4xl font-bold tracking-tight">Castify</h1>
      <p className="text-white/50 max-w-md">
        Multi-tenant P2P streaming platform. Each channel runs on its own subdomain.
      </p>
      <div className="bg-white/5 border border-white/10 rounded-xl px-6 py-5 text-left text-sm space-y-2 font-mono">
        <p className="text-white/40 text-xs uppercase tracking-widest mb-3">Local dev routes</p>
        <p>
          <span className="text-white/40">Channel home →</span>{' '}
          <a href="/demo" className="text-blue-400 hover:underline">
            localhost:3000/demo
          </a>
        </p>
        <p>
          <span className="text-white/40">VOD episode →</span>{' '}
          <span className="text-white/60">localhost:3000/demo/vod/[slug]</span>
        </p>
        <p>
          <span className="text-white/40">Dashboard →</span>{' '}
          <a href="/analytics" className="text-blue-400 hover:underline">
            localhost:3000/analytics
          </a>
        </p>
        <p>
          <span className="text-white/40">API health →</span>{' '}
          <a
            href="http://localhost:3001/health"
            target="_blank"
            rel="noreferrer"
            className="text-blue-400 hover:underline"
          >
            localhost:3001/health
          </a>
        </p>
      </div>
    </main>
  );
}
