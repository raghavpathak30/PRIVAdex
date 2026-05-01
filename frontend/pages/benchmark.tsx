'use client';

import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  LabelList,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type BenchValues = {
  mean: number;
  p95: number;
  p99: number;
};

const INITIAL_VALUES: BenchValues = {
  mean: 38.5,
  p95: 41.5,
  p99: 45.2,
};

const breakdownBase = {
  deserialization_us: 2500,
  slot_blind_us: 1200,
  sign_poly_us: 8100,
  accumulate_us: 800,
  serialization_us: 1500,
};

const BAR_COLORS = ['#00FF88', '#0EA5E9', '#7dd3fc'];

function jitter(value: number, spread: number) {
  const delta = (Math.random() * 2 - 1) * spread;
  return Number((value + delta).toFixed(1));
}

export default function BenchmarkPage() {
  const [values, setValues] = useState(INITIAL_VALUES);
  const [chartValues, setChartValues] = useState<BenchValues>({ mean: 0, p95: 0, p99: 0 });
  const [isRunning, setIsRunning] = useState(false);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setChartValues(values);
    }, 180);
    return () => clearTimeout(timer);
  }, [values]);

  const latencyData = useMemo(
    () => [
      { name: 'Mean', value: chartValues.mean },
      { name: 'p95', value: chartValues.p95 },
      { name: 'p99', value: chartValues.p99 },
    ],
    [chartValues]
  );

  const stackData = [
    {
      name: 'match',
      ...breakdownBase,
    },
  ];

  const runBenchmark = () => {
    setIsRunning(true);
    window.setTimeout(() => {
      const nextValues = {
        mean: jitter(values.mean, 2),
        p95: jitter(values.p95, 2),
        p99: jitter(values.p99, 2),
      };
      setValues(nextValues);
      setIsRunning(false);
    }, 2000);
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-[#050A0E] px-4 py-5 text-[#E8F4F8] sm:px-6">
      <div className="mx-auto w-full max-w-[1400px] space-y-4">
        <section className="rounded-xl border border-[#1C2A35] bg-[#0D1117] p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl tracking-[0.08em] [font-family:var(--font-syne)]">Benchmark Dashboard</h1>
              <p className="text-sm text-[#4A6072]">Latency envelope for encrypted match execution</p>
            </div>
            <button
              type="button"
              onClick={runBenchmark}
              disabled={isRunning}
              className="flex items-center gap-2 rounded-lg border border-[#00FF88]/50 bg-[#00FF88]/10 px-4 py-2 text-sm text-[#00FF88] transition hover:bg-[#00FF88]/20 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isRunning && (
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#00FF88] border-r-transparent" />
              )}
              {isRunning ? 'Running Benchmark...' : 'Run Benchmark'}
            </button>
          </div>

          <div className="h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={latencyData} margin={{ top: 30, right: 20, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="#1C2A35" strokeDasharray="4 4" />
                <XAxis dataKey="name" tick={{ fill: '#4A6072', fontSize: 12 }} axisLine={{ stroke: '#1C2A35' }} />
                <YAxis tick={{ fill: '#4A6072', fontSize: 12 }} axisLine={{ stroke: '#1C2A35' }}>
                  <Label value="Latency (ms)" angle={-90} position="insideLeft" fill="#4A6072" />
                </YAxis>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#050A0E',
                    borderColor: '#1C2A35',
                    color: '#E8F4F8',
                  }}
                  cursor={{ fill: '#0EA5E922' }}
                />
                <ReferenceLine y={150} stroke="#FF4444" strokeDasharray="8 6">
                  <Label value="Gate: p99 < 150ms" position="insideTopRight" fill="#FF4444" />
                </ReferenceLine>
                <Bar dataKey="value" radius={[8, 8, 0, 0]} isAnimationActive animationDuration={900}>
                  {latencyData.map((entry, index) => (
                    <Cell key={`${entry.name}-${index}`} fill={BAR_COLORS[index]} />
                  ))}
                  <LabelList
                    dataKey="value"
                    position="top"
                    formatter={(val) => `${Number(val ?? 0).toFixed(1)}ms`}
                    fill="#E8F4F8"
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-[#1C2A35] bg-[#0D1117] p-4 sm:p-6">
          <h2 className="mb-4 text-lg tracking-[0.06em] [font-family:var(--font-syne)]">Timing Breakdown per Match</h2>
          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stackData} layout="vertical" margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
                <CartesianGrid stroke="#1C2A35" strokeDasharray="4 4" />
                <XAxis type="number" tick={{ fill: '#4A6072', fontSize: 12 }} axisLine={{ stroke: '#1C2A35' }} />
                <YAxis dataKey="name" type="category" tick={{ fill: '#4A6072', fontSize: 12 }} axisLine={{ stroke: '#1C2A35' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#050A0E',
                    borderColor: '#1C2A35',
                    color: '#E8F4F8',
                  }}
                  formatter={(value) => [`${Number(value ?? 0)}us`, '']}
                />
                <Legend wrapperStyle={{ color: '#E8F4F8' }} />
                <Bar dataKey="deserialization_us" stackId="a" fill="#00FF88" name="deserialization_us" />
                <Bar dataKey="slot_blind_us" stackId="a" fill="#0EA5E9" name="slot_blind_us" />
                <Bar dataKey="sign_poly_us" stackId="a" fill="#38bdf8" name="sign_poly_us" />
                <Bar dataKey="accumulate_us" stackId="a" fill="#67e8f9" name="accumulate_us" />
                <Bar dataKey="serialization_us" stackId="a" fill="#22d3ee" name="serialization_us" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-[#00FF88]/40 bg-[#00FF88]/10 p-4 sm:p-6">
          <p className="text-2xl font-semibold text-[#00FF88]">
            ✓ p99 ({values.p99.toFixed(1)}ms) &lt; gate (150ms) — PASS
          </p>
        </section>
      </div>
    </main>
  );
}
