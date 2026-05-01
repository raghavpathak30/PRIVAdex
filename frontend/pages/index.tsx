'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

type SchemeMode = 'BFV' | 'CKKS';

const FLOW_STEPS = [
  'ENCRYPTING...',
  'SERIALIZING (~3.1 MB)',
  'SENDING VIA gRPC',
  'EVALUATING FHE',
  'DECRYPTING RESULT',
];

const THREAT_ROWS = [
  { id: 'T-01', name: 'Passive Eavesdropper' },
  { id: 'T-02', name: 'Malicious Engine' },
  { id: 'T-03', name: 'Front-runner/MEV' },
  { id: 'T-04', name: 'Slot Correlation' },
  { id: 'T-05', name: 'MatchCertificate Leakage' },
  { id: 'T-06', name: 'Replay Attack' },
  { id: 'T-07', name: 'Parameter Mismatch' },
  { id: 'T-08', name: 'Timing Correlation' },
];

const METRICS = [
  { label: 'Mean Latency', value: 38.5, suffix: 'ms' },
  { label: 'p99 Latency', value: 45.2, suffix: 'ms' },
  { label: 'Tests Passing', value: 14, suffix: '/14' },
  { label: 'Ciphertext Size', value: 3.1, suffix: 'MB' },
];

export default function Home() {
  const [mode, setMode] = useState<SchemeMode>('BFV');
  const [bid, setBid] = useState('1150');
  const [ask, setAsk] = useState('1105');
  const [quantity, setQuantity] = useState('24');
  const [poolId, setPoolId] = useState('pool_alpha');
  const [activeStep, setActiveStep] = useState(-1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [animatedStats, setAnimatedStats] = useState([0, 0, 0, 0]);
  const timeoutRefs = useRef<number[]>([]);

  useEffect(() => {
    const duration = 1200;
    const start = performance.now();
    const target = METRICS.map((metric) => metric.value);

    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedStats(target.map((value) => Number((value * eased).toFixed(2))));
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach((id) => clearTimeout(id));
    };
  }, []);

  const parsedBid = useMemo(() => Number(bid), [bid]);
  const parsedAsk = useMemo(() => Number(ask), [ask]);
  const isMatch = showResult && Number.isFinite(parsedBid) && Number.isFinite(parsedAsk) && parsedBid >= parsedAsk;

  const runFlow = (event: React.FormEvent) => {
    event.preventDefault();
    timeoutRefs.current.forEach((id) => clearTimeout(id));
    timeoutRefs.current = [];
    setIsSubmitting(true);
    setShowResult(false);
    setActiveStep(-1);

    FLOW_STEPS.forEach((_, index) => {
      const timeoutId = window.setTimeout(() => {
        setActiveStep(index);
      }, index * 600);
      timeoutRefs.current.push(timeoutId);
    });

    const doneId = window.setTimeout(() => {
      setIsSubmitting(false);
      setShowResult(true);
    }, FLOW_STEPS.length * 600 + 150);
    timeoutRefs.current.push(doneId);
  };

  return (
    <main className="relative min-h-[calc(100vh-4rem)] bg-[#050A0E] px-4 py-4 text-[#E8F4F8] sm:px-6">
      <div className="mx-auto grid h-full w-full max-w-[1600px] gap-4 xl:grid-cols-5">
        <section className="rounded-xl border border-[#1C2A35] bg-[#0D1117] p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-xl tracking-[0.08em] text-[#E8F4F8] [font-family:var(--font-syne)]">
              Order Submission Terminal
            </h1>
            <span className="rounded border border-[#1C2A35] bg-[#050A0E] px-2 py-1 text-xs text-[#4A6072]">
              trader_client
            </span>
          </div>

          <div className="mb-5 inline-flex rounded-lg border border-[#1C2A35] bg-[#050A0E] p-1">
            {(['BFV', 'CKKS'] as SchemeMode[]).map((scheme) => (
              <button
                key={scheme}
                type="button"
                onClick={() => setMode(scheme)}
                className={`rounded-md px-4 py-1.5 text-sm transition ${
                  mode === scheme ? 'bg-[#00FF88]/20 text-[#00FF88]' : 'text-[#4A6072] hover:text-[#E8F4F8]'
                }`}
              >
                {scheme} Mode
              </button>
            ))}
          </div>

          <form onSubmit={runFlow} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm text-[#4A6072]">
                Bid Price
                <input
                  value={bid}
                  onChange={(e) => setBid(e.target.value)}
                  type="number"
                  className="mt-1.5 w-full rounded-lg border border-[#1C2A35] bg-[#050A0E] px-3 py-2 text-[#E8F4F8] outline-none transition focus:border-[#00FF88]"
                />
              </label>
              <label className="block text-sm text-[#4A6072]">
                Ask Price
                <input
                  value={ask}
                  onChange={(e) => setAsk(e.target.value)}
                  type="number"
                  className="mt-1.5 w-full rounded-lg border border-[#1C2A35] bg-[#050A0E] px-3 py-2 text-[#E8F4F8] outline-none transition focus:border-[#00FF88]"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm text-[#4A6072]">
                Quantity
                <input
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  type="number"
                  className="mt-1.5 w-full rounded-lg border border-[#1C2A35] bg-[#050A0E] px-3 py-2 text-[#E8F4F8] outline-none transition focus:border-[#00FF88]"
                />
              </label>
              <label className="block text-sm text-[#4A6072]">
                Pool ID
                <select
                  value={poolId}
                  onChange={(e) => setPoolId(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-[#1C2A35] bg-[#050A0E] px-3 py-2 text-[#E8F4F8] outline-none transition focus:border-[#00FF88]"
                >
                  <option value="pool_alpha">pool_alpha</option>
                  <option value="pool_beta">pool_beta</option>
                </select>
              </label>
            </div>

            <button
              disabled={isSubmitting}
              type="submit"
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg border border-[#00FF88]/50 bg-[#00FF88]/10 px-4 py-2.5 text-sm font-medium text-[#00FF88] transition hover:bg-[#00FF88]/20 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span>🔒</span>
              <span>Submit Encrypted Order</span>
            </button>
          </form>

          <div className="mt-6 rounded-lg border border-[#1C2A35] bg-[#050A0E] p-4">
            <p className="mb-3 text-xs uppercase tracking-[0.18em] text-[#4A6072]">Execution Flow</p>
            <div className="space-y-2.5">
              {FLOW_STEPS.map((step, index) => {
                const isLit = index <= activeStep;
                return (
                  <div
                    key={step}
                    className={`rounded-md border px-3 py-2 text-sm transition ${
                      isLit
                        ? 'border-[#00FF88]/60 bg-[#00FF88]/10 text-[#00FF88]'
                        : 'border-[#1C2A35] bg-[#0D1117] text-[#4A6072]'
                    }`}
                  >
                    {step}
                  </div>
                );
              })}
            </div>
          </div>

          {showResult && (
            <div className="mt-5 rounded-lg border border-[#1C2A35] bg-[#050A0E] p-4">
              <p className="mb-3 text-xs uppercase tracking-[0.18em] text-[#4A6072]">Match Result</p>
              <p className={`text-lg font-semibold ${isMatch ? 'text-[#00FF88]' : 'text-[#FF4444]'}`}>
                {isMatch ? '✓ MATCH' : '✗ NO MATCH'}
              </p>
              {isMatch && (
                <p className="mt-2 text-xs text-[#4A6072] break-all">
                  cert_hash: 0x9c8a3f73e28bf104cb7dc2b2dba1ec4e53f2a531a0a53f1a2f90b1a4d4f912ab
                </p>
              )}
              <div className="mt-4 grid gap-2 text-sm text-[#E8F4F8] sm:grid-cols-4">
                <div className="rounded border border-[#1C2A35] bg-[#0D1117] px-2 py-1.5">
                  match_latency: 38.5ms
                </div>
                <div className="rounded border border-[#1C2A35] bg-[#0D1117] px-2 py-1.5">scheme: {mode}</div>
                <div className="rounded border border-[#1C2A35] bg-[#0D1117] px-2 py-1.5">pool: {poolId}</div>
                <div className="rounded border border-[#1C2A35] bg-[#0D1117] px-2 py-1.5">
                  noise_budget_remaining: 47 bits
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-4 xl:col-span-3">
          <div className="grid gap-4 sm:grid-cols-2">
            {METRICS.map((metric, index) => (
              <div key={metric.label} className="rounded-xl border border-[#1C2A35] bg-[#0D1117] p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-[#4A6072]">{metric.label}</p>
                <p className="mt-3 text-3xl text-[#00FF88]">
                  {index === 2 ? Math.round(animatedStats[index]) : animatedStats[index].toFixed(1)}
                  <span className="ml-1 text-base text-[#4A6072]">{metric.suffix}</span>
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-[#1C2A35] bg-[#0D1117] p-4">
            <h2 className="mb-3 text-lg tracking-[0.08em] text-[#E8F4F8] [font-family:var(--font-syne)]">
              Encryption Pipeline
            </h2>
            <div className="overflow-x-auto">
              <svg viewBox="0 0 1320 160" className="min-w-[900px]">
                <defs>
                  <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3.5" orient="auto">
                    <polygon points="0 0, 7 3.5, 0 7" fill="#00FF88" />
                  </marker>
                </defs>
                {[
                  { x: 10, text: 'Trader' },
                  { x: 235, text: 'gRPC :50053' },
                  { x: 470, text: 'Engine' },
                  { x: 695, text: 'Trader' },
                  { x: 920, text: 'Settlement Bridge' },
                  { x: 1170, text: 'Base2.0' },
                ].map((node) => (
                  <g key={node.text + node.x}>
                    <rect x={node.x} y={58} width={150} height={44} rx={8} fill="#050A0E" stroke="#1C2A35" />
                    <text x={node.x + 75} y={85} textAnchor="middle" fill="#E8F4F8" fontSize="13">
                      {node.text}
                    </text>
                  </g>
                ))}
                {[
                  { x1: 160, x2: 235, label: 'enc(bid,ask)' },
                  { x1: 385, x2: 470, label: 'FHE Eval' },
                  { x1: 620, x2: 695, label: 'enc(result)' },
                  { x1: 845, x2: 920, label: 'dec()' },
                  { x1: 1070, x2: 1170, label: 'tx_hash' },
                ].map((edge) => (
                  <g key={edge.label}>
                    <line
                      x1={edge.x1}
                      y1={80}
                      x2={edge.x2}
                      y2={80}
                      stroke="#00FF88"
                      strokeWidth="2"
                      strokeDasharray="10 8"
                      markerEnd="url(#arrow)"
                    >
                      <animate
                        attributeName="stroke-dashoffset"
                        from="36"
                        to="0"
                        dur="1.6s"
                        repeatCount="indefinite"
                      />
                    </line>
                    <text x={(edge.x1 + edge.x2) / 2} y={52} textAnchor="middle" fill="#4A6072" fontSize="11">
                      {edge.label}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          </div>

          <div className="rounded-xl border border-[#1C2A35] bg-[#0D1117] p-4">
            <h2 className="mb-3 text-lg tracking-[0.08em] text-[#E8F4F8] [font-family:var(--font-syne)]">
              Threat Model Status
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1C2A35] text-left text-[#4A6072]">
                    <th className="pb-2 pr-4">Threat ID</th>
                    <th className="pb-2 pr-4">Description</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {THREAT_ROWS.map((row) => (
                    <tr key={row.id} className="border-b border-[#1C2A35]/70">
                      <td className="py-2 pr-4 text-[#0EA5E9]">{row.id}</td>
                      <td className="py-2 pr-4 text-[#E8F4F8]">{row.name}</td>
                      <td className="py-2">
                        <span className="rounded border border-[#00FF88]/40 bg-[#00FF88]/10 px-2 py-0.5 text-xs text-[#00FF88]">
                          MITIGATED
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(14,165,233,0.08),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(0,255,136,0.08),transparent_30%)]" />
    </main>
  );
}
