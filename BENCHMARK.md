# Benchmark Summary

This document captures the benchmark methodology, acceptance gates, and latest measured results for the PrivaDEX DarkPool matching engine.

## Source of Record

- Primary artifact: `build/engine_bench_summary.json`
- Execution path: `benchmarks/engine_bench.cpp`
- Test gate wiring: CTest benchmark gate (`p99 < 150 ms`)

## Methodology

- Workload size: 16-order batch matching path.
- Measurement count: `N=100` iterations.
- Reported statistics: mean, p95, p99.
- Output contract: machine-readable JSON summary plus exit-code gate.
- Serialization mode in path: SEAL compression with zstd preference when available.

## Gate Criteria

- Primary performance gate: `p99 < 150 ms`.
- Mean and p95 are tracked for drift and regression visibility.
- Gate is enforced by benchmark exit code in CI/local ctest workflow.

## Latest Results

| Metric | Value | Gate | Status |
| --- | ---: | --- | --- |
| iterations | 100 | fixed window | PASS |
| mean_ms | 38.5274 | informational | PASS |
| p95_ms | 41.502 | informational | PASS |
| p99_ms | 45.164 | `< 150 ms` | PASS |

## Interpretation

- Current p99 is substantially below gate, leaving meaningful tail-latency headroom.
- The benchmark confirms post-audit hardening did not break latency targets.
- This benchmark is local/off-chain matching performance and does not represent on-chain finality latency.
