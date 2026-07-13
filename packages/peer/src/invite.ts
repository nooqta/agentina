import { INVITE_SCHEME, INVITE_PATH_PREFIX, PROTOCOL_VERSION } from "@agentina-mesh/protocol"
import type { InvitePayload } from "@agentina-mesh/protocol"

// --- Invite codec: agentina://join/<base64url(JSON)> ---
//
// v2 semantics (vs agentx v1): the link carries a ONE-TIME invite token
// that /pair/complete consumes to mint the real per-party bearer pair.
// A leaked link that was already redeemed is worthless; a permanent
// credential never rides in a URL.

function b64urlEncode(input: string): string {
  return Buffer.from(input, "utf-8").toString("base64url")
}

function b64urlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf-8")
}

export function encodeInvite(payload: InvitePayload): string {
  return `${INVITE_SCHEME}${INVITE_PATH_PREFIX}${b64urlEncode(JSON.stringify(payload))}`
}

export function decodeInvite(link: string): InvitePayload {
  const prefix = `${INVITE_SCHEME}${INVITE_PATH_PREFIX}`
  if (!link.startsWith(prefix)) {
    throw new Error(`Not an agentina invite link — expected ${prefix}…`)
  }
  const parsed = JSON.parse(b64urlDecode(link.slice(prefix.length)))
  if (parsed.version !== 2) throw new Error(`Unsupported invite version: ${parsed.version}`)
  if (
    typeof parsed.url !== "string" ||
    typeof parsed.inviteToken !== "string" ||
    typeof parsed.partyName !== "string"
  ) {
    throw new Error("Invite payload missing required fields (url, inviteToken, partyName)")
  }
  if (parsed.protocol !== PROTOCOL_VERSION) {
    throw new Error(`Protocol mismatch: invite is ${parsed.protocol}, this node speaks ${PROTOCOL_VERSION}`)
  }
  return parsed as InvitePayload
}
