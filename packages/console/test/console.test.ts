import { describe, it, expect } from "vitest"
import { CONSOLE_HTML } from "@agentina-mesh/console"

// The console lives inside a TS template literal, where \" and \\n in
// inline JS silently collapse and break the page AT RUNTIME with a
// blank screen (it happened: the "page is empty" incident, 2026-07-14).
// This test parses the served script exactly like a browser would.

describe("console page integrity", () => {
  it("inline script parses as valid JavaScript", () => {
    const start = CONSOLE_HTML.indexOf("<script>") + "<script>".length
    const end = CONSOLE_HTML.indexOf("</script>", start)
    expect(start).toBeGreaterThan(8)
    expect(end).toBeGreaterThan(start)
    const script = CONSOLE_HTML.slice(start, end)
    expect(script.length).toBeGreaterThan(1000)
    // Throws SyntaxError on any collapsed-escape breakage.
    expect(() => new Function(script)).not.toThrow()
  })

  it("no un-collapsed escape artifacts survive in the HTML", () => {
    // A literal backslash-quote in the OUTPUT means someone wrote \\\" in
    // the template literal — the browser-side string will terminate early.
    expect(CONSOLE_HTML.includes('\\"')).toBe(false)
  })

  it("core surfaces are present", () => {
    for (const marker of [
      // shell
      'id="col"', 'id="toast"',
      // every screen of the v3 design
      "SCREENS.onboarding", "SCREENS.invite", "SCREENS.join", "SCREENS.home",
      "SCREENS.contact", "SCREENS.ask", "SCREENS.share", "SCREENS.agents",
      "SCREENS.agentEdit", "SCREENS.agentNew", "SCREENS.runtimes",
      "SCREENS.activity", "SCREENS.advanced", "SCREENS.channel",
      "SCREENS.account", "SCREENS.networkHelp",
      "SCREENS.help", "SCREENS.guide",
      // all four configurable channels have turn-it-on forms
      "whatsapp:", "github:", "telegram:", "gitlab:",
      // key copy and wiring
      "Ask their agents", "Share something", "agentina://join/",
      "/environment/refresh", "/agentina/v1",
    ]) {
      expect(CONSOLE_HTML, marker).toContain(marker)
    }
  })
})
