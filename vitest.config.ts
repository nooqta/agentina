import { defineConfig } from "vitest/config"
import { resolve } from "node:path"

export default defineConfig({
  resolve: {
    alias: {
      "@agentina-mesh/protocol": resolve(__dirname, "packages/protocol/src/index.ts"),
      "@agentina-mesh/peer": resolve(__dirname, "packages/peer/src/index.ts"),
      "@agentina-mesh/grants": resolve(__dirname, "packages/grants/src/index.ts"),
      "@agentina-mesh/node": resolve(__dirname, "packages/node/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    testTimeout: 20_000,
  },
})
