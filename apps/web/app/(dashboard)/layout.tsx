export default function DashboardLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex min-h-screen">
      <aside className="w-64 bg-white/5 border-r border-white/10 flex flex-col gap-2 p-6">
        <p className="text-xs uppercase tracking-widest text-white/40 mb-4">Dashboard</p>
        <a href="/analytics" className="px-3 py-2 rounded-lg hover:bg-white/10 transition text-sm">
          Analytics
        </a>
        <a href="/content" className="px-3 py-2 rounded-lg hover:bg-white/10 transition text-sm">
          Content
        </a>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
