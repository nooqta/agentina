import { describe, it, expect } from "vitest"
import { runDemo } from "../src/demo"

// The M0 integration suite IS the demo: real HTTP over loopback, two
// nodes, no mocks, no LLM keys. Each scorecard step is an assertion.

describe("M0 — pair → test → task → deny → revoke → audit", () => {
  it("runs the full two-party loop", async () => {
    const lines: string[] = []
    const result = await runDemo({ basePort: 19801, print: (l) => lines.push(l) })
    for (const step of result.steps) {
      expect(step.ok, `${step.name}: ${step.detail}`).toBe(true)
    }
    expect(result.ok).toBe(true)
    expect(result.steps.map((s) => s.name)).toEqual([
      "pair",
      "invite replay rejected",
      "connection test",
      "task round-trip",
      "forged token denied",
      "revocation",
      "audit trail",
    ])
  }, 30_000)
})
