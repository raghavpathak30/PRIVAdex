# Benchmark Summary

Source: [build/engine_bench_summary.json](build/engine_bench_summary.json)

| Metric | Value | Gate | Result |
| --- | ---:| --- | --- |
| iterations | 100 | fixed measurement window | pass |
| mean_ms | 35.2699 | informational | pass |
| p95_ms | 38.276 | informational | pass |
| p99_ms | 40.968 | `< 150 ms` | pass |

The measured p99 latency is well below the 150 ms gate, which means the current local matching path has substantial tail-latency headroom. In practical terms, the server has room for normal machine-to-machine variation, moderate load, and additional protocol work before it approaches the current performance threshold.
