# TrafficLens Detection Rules & SLO Baselines

Reference documentation for evaluating API operational health.

## 1. Latency Targets (SLOs)
- **Healthy:** p95 < 200ms, p99 < 500ms
- **Warning:** 200ms <= p95 <= 500ms
- **Critical (Regression):** p95 > 500ms or p99 > 1000ms
- **Action:** Profile route, identify database N+1 queries, add memory cache, optimize synchronous I/O.

## 2. Error Budgets & Availability
- **Warning:** 4xx/5xx error rate > 5% of total requests
- **Critical:** Error rate > 10% or timeouts > 0
- **Action:** Inspect server logs, validate payload schemas, review upstream dependencies.

## 3. Repeated-Response / Cache Candidates
- **Criteria:** Normalized GET responses identical > 80% with low parameter variance.
- **Estimated Savings:** Up to 90% reduction in CPU and database load.
- **Action:** Recommend 60s TTL HTTP Cache-Control (`Cache-Control: public, max-age=60`).

## 4. Retry Storms & Duplicate Writes
- **Criteria:** Burst of non-2xx status followed by identical request payloads within 5-second window.
- **Risk:** Duplicate database mutations and cascading outages.
- **Action:** Require Idempotency-Key headers on write routes and implement exponential backoff with jitter.
