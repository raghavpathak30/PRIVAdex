'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

const FLOW_STEPS = [
  'enc(result) [SEAL]',
  're-encrypt under fhEVM pubkey',
  'TFHE.asEuint64()',
  'settleMatch() on Zama Devnet',
];

const CONTRACT_ADDRESS = '0x7A4f8D1Bf2A9c3E16D4e1f8B8c25A6fA9D8100Ce';

function mockTxHash() {
  const chars = '0123456789abcdef';
  let hash = '0x';
  for (let i = 0; i < 64; i += 1) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

export default function SettlementPage() {
  const [activeStep, setActiveStep] = useState(-1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txHash, setTxHash] = useState('0x9ca3f1e32c9c2ea19495efadf11d6dc2f40f2f78ab38ffab8ed7442d289bd41e');
  const timeoutRefs = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach((id) => clearTimeout(id));
    };
  }, []);

  const flowPreview = useMemo(() => FLOW_STEPS.join(' -> '), []);

  const handleSubmit = () => {
    timeoutRefs.current.forEach((id) => clearTimeout(id));
    timeoutRefs.current = [];
    setActiveStep(-1);
    setIsSubmitting(true);

    FLOW_STEPS.forEach((_, index) => {
      const timeoutId = window.setTimeout(() => {
        setActiveStep(index);
      }, index * 700);
      timeoutRefs.current.push(timeoutId);
    });

    const doneId = window.setTimeout(() => {
      setIsSubmitting(false);
      setTxHash(mockTxHash());
    }, FLOW_STEPS.length * 700 + 250);
    timeoutRefs.current.push(doneId);
  };

  return (
    <main className="relative min-h-[calc(100vh-4rem)] overflow-hidden bg-[#050A0E] px-4 py-6 text-[#E8F4F8] sm:px-6">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_80%_0%,rgba(14,165,233,0.16),transparent_35%),radial-gradient(circle_at_10%_20%,rgba(0,255,136,0.12),transparent_28%)]" />

      <div className="mx-auto grid w-full max-w-[1400px] gap-4 lg:grid-cols-5">
        <section className="rounded-xl border border-[#1C2A35] bg-[#0D1117] p-5 lg:col-span-3">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl tracking-[0.08em] [font-family:var(--font-syne)]">On-Chain Settlement Panel</h1>
              <p className="mt-1 text-sm text-[#4A6072]">Zama fhEVM integration path for encrypted match certificates.</p>
            </div>
            <div className="rounded-md border border-[#0EA5E9]/40 bg-[#0EA5E9]/10 px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-[#0EA5E9]">
              Live Demo Mode
            </div>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-[#00FF88]/40 bg-[#00FF88]/10 px-4 py-3 text-sm font-medium text-[#00FF88] transition hover:bg-[#00FF88]/20 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#00FF88] border-r-transparent" />
            ) : (
              <span>⬢</span>
            )}
            Submit Match Certificate On-Chain
          </button>

          <div className="rounded-lg border border-[#1C2A35] bg-[#050A0E] p-4">
            <p className="mb-3 text-xs uppercase tracking-[0.16em] text-[#4A6072]">Flow</p>
            <p className="mb-4 text-sm text-[#0EA5E9]">{flowPreview}</p>
            <div className="space-y-2.5">
              {FLOW_STEPS.map((step, index) => {
                const isDone = index <= activeStep;
                return (
                  <div
                    key={step}
                    className={`rounded-md border px-3 py-2 text-sm transition ${
                      isDone
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

          <div className="mt-4 rounded-lg border border-[#0EA5E9]/30 bg-[#0EA5E9]/8 p-4 text-sm text-[#E8F4F8]">
            <p className="mb-2 text-xs uppercase tracking-[0.14em] text-[#4A6072]">Confidentiality Guarantee</p>
            <p className="leading-relaxed">
              Match result stays encrypted on-chain as euint64. Only counterparties can decrypt via TFHE.allow().
            </p>
          </div>
        </section>

        <section className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border border-[#1C2A35] bg-[#0D1117] p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.14em] text-[#4A6072]">Network Metadata</p>
              <div className="rounded-md border border-[#00FF88]/40 bg-[#00FF88]/10 px-2 py-1 text-xs text-[#00FF88]">
                Finality: Fast
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="rounded-md border border-[#1C2A35] bg-[#050A0E] p-3">
                <p className="text-xs text-[#4A6072]">Contract Address</p>
                <p className="mt-1 break-all text-[#E8F4F8]">{CONTRACT_ADDRESS}</p>
              </div>
              <div className="rounded-md border border-[#1C2A35] bg-[#050A0E] p-3">
                <p className="text-xs text-[#4A6072]">Chain</p>
                <p className="mt-1 text-[#E8F4F8]">Zama Devnet (9000)</p>
              </div>
              <div className="rounded-md border border-[#1C2A35] bg-[#050A0E] p-3">
                <p className="text-xs text-[#4A6072]">TX Hash (mocked)</p>
                <p className="mt-1 break-all text-[#00FF88]">{txHash}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#0EA5E9]/35 bg-[#0EA5E9]/10 p-5">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#0EA5E9]/50 bg-[#050A0E] px-3 py-1 text-xs uppercase tracking-[0.12em] text-[#0EA5E9]">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#0EA5E9] text-[10px]">Z</span>
              Zama Partner Track
            </div>
            <h2 className="text-lg [font-family:var(--font-syne)]">fhEVM-Ready Settlement</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#E8F4F8]">
              This panel demonstrates encrypted lifecycle continuity from SEAL outputs to TFHE-compatible on-chain storage,
              preserving confidentiality through settlement.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
