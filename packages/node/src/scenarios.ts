// --- Real-world scenarios: the product's front door ---
//
// Nobody wakes up wanting "grants". They want: work with my client,
// hand my accountant the invoices, let the agency touch staging, help
// mom with her computer. A scenario is declarative data — role-scoped
// presets over the existing primitives (/agents, /shares, /sessions).
// The console renders them as a guided wizard; the CLI prints them;
// each one is also a tutorial script (docs/tutorials/scenarios/).

export interface ScenarioStep {
  /** Which primitive this step drives. */
  action: "create-agent" | "share-agent" | "share-folder" | "share-server" | "share-repo"
  /** Shown to the user as the step's purpose. */
  title: string
  /** Prefills; the wizard lets the user adjust before confirming. */
  defaults: {
    agentId?: string
    agentPrompt?: string
    mode?: "ro" | "rw"
    /** Preset duration in seconds; undefined = until stopped. */
    durationSeconds?: number
    /** Placeholder guidance for the path/host/url field. */
    valueHint?: string
  }
  /** Needs the AI runtime (hidden with an explainer when claude is missing). */
  needsAi?: boolean
  /** Needs git / ssh on the machine. */
  needs?: "git" | "ssh"
}

export interface Scenario {
  id: string
  title: string
  tagline: string
  /** [roleA, roleB] — the wizard asks "you're the ___?" */
  roles: [string, string]
  /** Steps per role index. */
  steps: [ScenarioStep[], ScenarioStep[]]
}

export const SCENARIOS: Scenario[] = [
  {
    id: "freelancer-client",
    title: "Freelancer ↔ Client",
    tagline: "Deliver a project without emailing files back and forth.",
    roles: ["the freelancer", "the client"],
    steps: [
      [
        {
          action: "create-agent",
          title: "Create your project assistant",
          defaults: {
            agentId: "assistant",
            agentPrompt: "You are my assistant for this client project. Answer questions about the work in progress, drafts, and timelines from the files in your folder.",
            valueHint: "the folder where you keep this project's work",
          },
          needsAi: true,
        },
        {
          action: "share-agent",
          title: "Share the assistant with your client",
          defaults: { agentId: "assistant", mode: "ro" },
          needsAi: true,
        },
      ],
      [
        {
          action: "share-folder",
          title: "Share the project brief and materials",
          defaults: { mode: "ro", valueHint: "the folder with the brief, assets, and docs" },
        },
      ],
    ],
  },
  {
    id: "accountant-business",
    title: "Accountant ↔ Small business",
    tagline: "Monthly books without a single email attachment.",
    roles: ["the accountant", "the business owner"],
    steps: [
      [
        {
          action: "create-agent",
          title: "Create your bookkeeper assistant",
          defaults: {
            agentId: "bookkeeper",
            agentPrompt: "You are a bookkeeping assistant. Answer questions about invoices, receipts, and spending from the documents in your folder. Be precise with numbers; cite the file you got them from.",
            valueHint: "the folder where client documents arrive",
          },
          needsAi: true,
        },
        {
          action: "share-agent",
          title: "Let the business ask the bookkeeper questions",
          defaults: { agentId: "bookkeeper", mode: "ro" },
          needsAi: true,
        },
      ],
      [
        {
          action: "share-folder",
          title: "Share this month's invoices and receipts",
          defaults: { mode: "ro", durationSeconds: 31 * 24 * 3600, valueHint: "the folder with invoices & receipts" },
        },
      ],
    ],
  },
  {
    id: "agency-client",
    title: "Agency ↔ Client",
    tagline: "Status on demand, staging access per sprint — nothing standing.",
    roles: ["the agency", "the client"],
    steps: [
      [
        {
          action: "create-agent",
          title: "Create the client's status assistant",
          defaults: {
            agentId: "status",
            agentPrompt: "You are the status assistant for this client's project. Report progress, blockers, and next steps from the project folder. Be concise and business-friendly.",
            valueHint: "this client's project folder",
          },
          needsAi: true,
        },
        {
          action: "share-agent",
          title: "Give the client their status line",
          defaults: { agentId: "status", mode: "ro" },
          needsAi: true,
        },
      ],
      [
        {
          action: "share-repo",
          title: "Share the code repository (read-only)",
          defaults: { mode: "ro", durationSeconds: 14 * 24 * 3600, valueHint: "https://… or git@… of your repo" },
          needs: "git",
        },
        {
          action: "share-server",
          title: "Share staging access for this sprint",
          defaults: { mode: "ro", durationSeconds: 14 * 24 * 3600, valueHint: "deploy@staging.yourcompany.com" },
          needs: "ssh",
        },
      ],
    ],
  },
  {
    id: "it-helper-family",
    title: "IT helper ↔ Family or friend",
    tagline: "Help someone's computer for an hour — they watch every move.",
    roles: ["the helper", "the person being helped"],
    steps: [
      [],
      [
        {
          action: "share-folder",
          title: "Let your helper see the folder with the problem",
          defaults: { mode: "rw", durationSeconds: 3600, valueHint: "the folder they should look at (e.g. Documents)" },
        },
      ],
    ],
  },
]
