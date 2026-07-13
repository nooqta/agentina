import { describe, it, expect } from "vitest"
import { runDemo } from "../src/demo"

// The integration suite IS the demo: real HTTP over loopback, two
// nodes, real grants, no mocks, no LLM keys. Each scorecard step is an
// assertion.

describe("M1 — pair → deny → grant → scoped read → escape denied → revoke → audit", () => {
  it("runs the full freelancer↔client loop", async () => {
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
      "deny before grant",
      "grant",
      "scoped read",
      "path escape denied",
      "ungranted agent denied",
      "forged token denied",
      "grant revoked",
      "audit trail",
    ])
  }, 30_000)
})
