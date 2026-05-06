export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-[#DED3C3] bg-[#F6F1E8]/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[1320px] items-center justify-between px-5 sm:px-8">
        <div>
          <p className="text-lg font-semibold tracking-[0.12em] text-[#111827] [font-family:var(--font-syne)]">
            PrivaDEX
          </p>
          <p className="text-xs tracking-[0.18em] text-[#8B6F47]">private matching, told simply</p>
        </div>

        <nav className="flex items-center gap-2 text-sm text-[#374151]">
          <a href="#story" className="rounded-full px-3 py-2 transition hover:bg-white hover:text-[#111827]">Story</a>
          <a href="#demo" className="rounded-full px-3 py-2 transition hover:bg-white hover:text-[#111827]">Demo</a>
          <a href="#contract" className="rounded-full px-3 py-2 transition hover:bg-white hover:text-[#111827]">Contract</a>
        </nav>
      </div>
    </header>
  );
}
