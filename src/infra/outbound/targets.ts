import type { ClawdbotConfig } from "../../config/config.js";
import type { SessionEntry } from "../../config/sessions.js";
import {
  getProviderPlugin,
  normalizeProviderId,
} from "../../providers/plugins/index.js";
import type {
  ProviderId,
  ProviderOutboundTargetMode,
} from "../../providers/plugins/types.js";

export type OutboundProvider = ProviderId | "none";

export type HeartbeatTarget = OutboundProvider | "last";

export type OutboundTarget = {
  provider: OutboundProvider;
  to?: string;
  reason?: string;
};

export type OutboundTargetResolution =
  | { ok: true; to: string }
  | { ok: false; error: Error };

export function resolveOutboundTarget(params: {
  provider: ProviderId | "webchat" | "none";
  to?: string;
  allowFrom?: string[];
  cfg?: ClawdbotConfig;
  accountId?: string | null;
  mode?: ProviderOutboundTargetMode;
}): OutboundTargetResolution {
  if (params.provider === "none") {
    return {
      ok: false,
      error: new Error("Provider 'none' cannot send messages."),
    };
  }
  if (params.provider === "webchat") {
    return {
      ok: false,
      error: new Error(
        "Delivering to WebChat is not supported via `clawdbot agent`; use WhatsApp/Telegram or run with --deliver=false.",
      ),
    };
  }

  const plugin = getProviderPlugin(params.provider);
  const resolver = plugin?.outbound?.resolveTarget;
  if (!plugin || !resolver) {
    return {
      ok: false,
      error: new Error(`Unsupported provider: ${params.provider}`),
    };
  }

  const allowFrom =
    params.allowFrom ??
    (params.cfg && plugin.config.resolveAllowFrom
      ? plugin.config.resolveAllowFrom({
          cfg: params.cfg,
          accountId: params.accountId,
        })
      : undefined);

  return resolver({
    cfg: params.cfg,
    to: params.to,
    allowFrom,
    accountId: params.accountId,
    mode: params.mode,
  });
}

export function resolveHeartbeatDeliveryTarget(params: {
  cfg: ClawdbotConfig;
  entry?: SessionEntry;
}): OutboundTarget {
  const { cfg, entry } = params;
  const rawTarget = cfg.agents?.defaults?.heartbeat?.target;
  const target = (() => {
    if (typeof rawTarget !== "string") return "last" as const;
    const trimmed = rawTarget.trim().toLowerCase();
    if (!trimmed) return "last" as const;
    if (trimmed === "none" || trimmed === "last") return trimmed;
    return normalizeProviderId(trimmed) ?? "last";
  })();
  if (target === "none") {
    return { provider: "none", reason: "target-none" };
  }

  const explicitTo =
    typeof cfg.agents?.defaults?.heartbeat?.to === "string" &&
    cfg.agents.defaults.heartbeat.to.trim()
      ? cfg.agents.defaults.heartbeat.to.trim()
      : undefined;

  const lastProvider =
    entry?.lastProvider && entry.lastProvider !== "webchat"
      ? normalizeProviderId(entry.lastProvider)
      : undefined;
  const lastTo = typeof entry?.lastTo === "string" ? entry.lastTo.trim() : "";

  const provider = target === "last" ? lastProvider : target;
  const toCandidate =
    explicitTo ||
    (provider && lastProvider === provider ? lastTo : undefined) ||
    (target === "last" ? lastTo : undefined);

  if (!provider || !toCandidate) {
    return { provider: "none", reason: "no-target" };
  }

  const mode: ProviderOutboundTargetMode = explicitTo ? "explicit" : "heartbeat";
  const resolved = resolveOutboundTarget({
    provider,
    to: toCandidate,
    cfg,
    accountId: target === "last" ? entry?.lastAccountId : undefined,
    mode,
  });
  return resolved.ok
    ? { provider, to: resolved.to }
    : { provider: "none", reason: "no-target" };
}
