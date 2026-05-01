'use client';

import React, { useState } from 'react';

const schemeRows = [
  {
    dimension: 'Arithmetic precision',
    bfv: 'Exact integer arithmetic over plaintext modulus',
    ckks: 'Approximate floating point over encoded vectors',
  },
  {
    dimension: 'Ideal use case',
    bfv: 'Exact match logic, proofs, threshold checks',
    ckks: 'Analytics, scoring models, tolerable approximation',
  },
  {
    dimension: 'Depth budget need',
    bfv: 'Moderate depth for exact branching constraints',
    ckks: 'Higher multiplicative depth for chained numeric ops',
  },
  {
    dimension: 'Noise behavior',
    bfv: 'Deterministic growth tied to integer ops',
    ckks: 'Scale management and rescaling critical',
  },
  {
    dimension: 'Output interpretation',
    bfv: 'Discrete and unambiguous after decrypt',
    ckks: 'Rounded interpretation with precision budget',
  },
];

const lifecycle = [
  'Trader builds order intent (bid, ask, qty, nonce)',
  'Client validates parameter set against policy hash',
  'BFV/CKKS context selected and key handles loaded',
  'Order vector encoded into scheme-compatible plaintext',
  'Public-key encryption produces ciphertext payload',
  'Ciphertext serialized into transport frame (~3.1MB)',
  'gRPC request signed with request_id and anti-replay nonce',
  'Network edge forwards payload to matching server :50053',
  'Server deserializes and performs structural checks',
  'Engine applies slot blinding to decorrelate order position',
  'FHE evaluator executes encrypted comparison circuit',
  'Match certificate commitment generated in encrypted form',
  'Encrypted result serialized back to trader response',
  'Trader client decrypts result with local secret key',
  'Settlement bridge packages proof-bearing settlement input',
  'On-chain call submits encrypted handle and audit metadata',
  'Base2.0 finalizes tx hash for immutable settlement trace',
];

const engineKeys = [
  'Public key (encryption only)',
  'Evaluation keys (relinearization/rotation)',
  'Parameter metadata hash',
  'Ephemeral transport keys',
  'Nonce replay database',
];

const traderKeys = [
  'Public keypair owner metadata',
  'Secret key for decryption',
  'Nonce seed and request signer',
  'Session proof material',
  'Local match certificate verifier',
];

export default function ArchitecturePage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-[#050A0E] px-4 py-5 text-[#E8F4F8] sm:px-6">
      <div className="mx-auto w-full max-w-[1400px] space-y-4">
        <section className="rounded-xl border border-[#1C2A35] bg-[#0D1117] p-4 sm:p-6">
          <h1 className="text-2xl tracking-[0.08em] [font-family:var(--font-syne)]">Architecture Deep Dive</h1>
          <p className="mt-1 text-sm text-[#4A6072]">Hybrid BFV+CKKS design for confidential matching and auditable settlement.</p>

          <div className="mt-5 overflow-x-auto rounded-lg border border-[#1C2A35]">
            <table className="min-w-full text-sm">
              <thead className="bg-[#050A0E] text-left text-[#4A6072]">
                <tr>
                  <th className="px-3 py-2">Dimension</th>
                  <th className="px-3 py-2">BFV</th>
                  <th className="px-3 py-2">CKKS</th>
                </tr>
              </thead>
              <tbody>
                {schemeRows.map((row) => (
                  <tr key={row.dimension} className="border-t border-[#1C2A35] align-top">
                    <td className="px-3 py-3 text-[#0EA5E9]">{row.dimension}</td>
                    <td className="px-3 py-3 text-[#E8F4F8]">{row.bfv}</td>
                    <td className="px-3 py-3 text-[#E8F4F8]">{row.ckks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-[#1C2A35] bg-[#0D1117] p-4 sm:p-6">
          <h2 className="mb-4 text-xl tracking-[0.06em] [font-family:var(--font-syne)]">17-Hop Data Lifecycle Trace</h2>
          <div className="space-y-2">
            {lifecycle.map((step, index) => {
              const isOpen = openIndex === index;
              return (
                <article key={step} className="rounded-lg border border-[#1C2A35] bg-[#050A0E]">
                  <button
                    type="button"
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <span className="text-sm text-[#E8F4F8]">
                      <span className="mr-2 text-[#00FF88]">Hop {index + 1}</span>
                      {step.split('(')[0].trim()}
                    </span>
                    <span className="text-[#4A6072]">{isOpen ? '−' : '+'}</span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-[#1C2A35] px-4 py-3 text-sm text-[#4A6072]">
                      {step}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-[#1C2A35] bg-[#0D1117] p-4 sm:p-6">
          <h2 className="mb-4 text-xl tracking-[0.06em] [font-family:var(--font-syne)]">Key Distribution Audit</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-[#1C2A35] bg-[#050A0E] p-4">
              <p className="mb-3 text-sm uppercase tracking-[0.14em] text-[#0EA5E9]">Engine Holds</p>
              <ul className="space-y-2 text-sm text-[#E8F4F8]">
                {engineKeys.map((key) => (
                  <li key={key} className="rounded border border-[#1C2A35] bg-[#0D1117] px-3 py-2">
                    {key}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-[#1C2A35] bg-[#050A0E] p-4">
              <p className="mb-3 text-sm uppercase tracking-[0.14em] text-[#00FF88]">Trader Client Holds</p>
              <ul className="space-y-2 text-sm text-[#E8F4F8]">
                {traderKeys.map((key) => (
                  <li key={key} className="rounded border border-[#1C2A35] bg-[#0D1117] px-3 py-2">
                    {key}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-[#FF4444]/60 bg-[#FF4444]/10 px-4 py-3 text-sm font-semibold text-[#FF4444]">
            SECRET KEY — ENGINE NEVER SEES THIS
          </div>
        </section>
      </div>
    </main>
  );
}
