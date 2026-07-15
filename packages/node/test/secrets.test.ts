import { mkdtempSync, statSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it, expect } from "vitest"
import { loadSecrets, storeSecret } from "../src/secrets"

// Paste-a-token security model: values live in an owner-only file,
// become process env immediately, and NEVER override a real env var.

describe("secrets — the paste-a-token store", () => {
  it("stores, restricts to owner, and applies immediately", () => {
    const path = join(mkdtempSync(join(tmpdir(), "agentina-sec-")), "secrets.env")
    storeSecret(path, "TEST_TOKEN_A", "s3cret-value")
    expect(process.env.TEST_TOKEN_A).toBe("s3cret-value")
    expect(statSync(path).mode & 0o777).toBe(0o600)
    // Replacing keeps one line per key.
    storeSecret(path, "TEST_TOKEN_A", "new-value")
    const lines = readFileSync(path, "utf-8").split("\n").filter((l) => l.startsWith("TEST_TOKEN_A="))
    expect(lines).toEqual(["TEST_TOKEN_A=new-value"])
    expect(process.env.TEST_TOKEN_A).toBe("new-value")
    delete process.env.TEST_TOKEN_A
  })

  it("loads at boot but a real environment variable wins", () => {
    const path = join(mkdtempSync(join(tmpdir(), "agentina-sec-")), "secrets.env")
    storeSecret(path, "TEST_TOKEN_B", "from-file")
    delete process.env.TEST_TOKEN_B
    process.env.TEST_TOKEN_C = "from-env"
    storeSecret(path, "TEST_TOKEN_C", "from-file")
    delete process.env.TEST_TOKEN_B
    process.env.TEST_TOKEN_C = "from-env"
    loadSecrets(path)
    expect(process.env.TEST_TOKEN_B).toBe("from-file")
    expect(process.env.TEST_TOKEN_C).toBe("from-env")
    delete process.env.TEST_TOKEN_B
    delete process.env.TEST_TOKEN_C
  })

  it("rejects names that could break the file format", () => {
    const path = join(mkdtempSync(join(tmpdir(), "agentina-sec-")), "secrets.env")
    expect(() => storeSecret(path, "BAD NAME", "x")).toThrow()
    expect(() => storeSecret(path, "OK_NAME", "")).toThrow()
  })
})
