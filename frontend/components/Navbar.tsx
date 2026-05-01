import Link from 'next/link';

const navItems = [
  { label: 'Dashboard', href: '/' },
  { label: 'Benchmark', href: '/benchmark' },
  { label: 'Architecture', href: '/architecture' },
  { label: 'Settlement', href: '/settlement' },
];

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-[#1C2A35] bg-[#050A0E]/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-lg font-semibold tracking-[0.12em] text-[#00FF88] [font-family:var(--font-syne)]">
              PrivaDEX
            </p>
            <p className="text-xs tracking-[0.2em] text-[#4A6072]">DarkPool v2.0</p>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-[#1C2A35] bg-[#0D1117] px-3 py-1 text-xs text-[#E8F4F8] md:flex">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00FF88] opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#00FF88]" />
            </span>
            Engine: LIVE
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <nav className="flex items-center gap-1 rounded-full border border-[#1C2A35] bg-[#0D1117] p-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full px-3 py-1.5 text-xs text-[#E8F4F8] transition hover:bg-[#13232e] hover:text-[#00FF88] sm:text-sm"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <span className="rounded-md border border-[#0EA5E9]/40 bg-[#0EA5E9]/10 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[#0EA5E9] sm:text-xs">
            Zama Builder Track
          </span>
        </div>
      </div>
    </header>
  );
}
