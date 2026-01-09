import type { ClawdbotConfig } from "../../config/config.js";
import { listProviderPlugins } from "../../providers/plugins/index.js";
import type {
  ProviderId,
  ProviderPlugin,
} from "../../providers/plugins/types.js";
import { normalizeMessageProvider } from "../../utils/message-provider.js";

export type MessageProviderId = ProviderId;

let cachedMessageProviders: MessageProviderId[] | null = null;

const listMessageProviders = (): MessageProviderId[] => {
  if (!cachedMessageProviders) {
    cachedMessageProviders = listProviderPlugins().map(
      (plugin) => plugin.id,
    ) as MessageProviderId[];
  }
  return cachedMessageProviders;
};

function isKnownProvider(value: string): value is MessageProviderId {
  return listMessageProviders().includes(value as MessageProviderId);
}

async function isProviderConfigured(
  plugin: ProviderPlugin,
  cfg: ClawdbotConfig,
): Promise<boolean> {
  const accountIds = plugin.config.listAccountIds(cfg);
  for (const accountId of accountIds) {
    const account = plugin.config.resolveAccount(cfg, accountId);
    if (account && typeof account === "object") {
      const enabled = (account as { enabled?: boolean }).enabled;
      if (enabled === false) continue;
    }
    if (plugin.config.isConfigured) {
      const configured = await plugin.config.isConfigured(account, cfg);
      if (configured) return true;
      continue;
    }
    return true;
  }
  return false;
}

export async function listConfiguredMessageProviders(
  cfg: ClawdbotConfig,
): Promise<MessageProviderId[]> {
  const providers: MessageProviderId[] = [];
  for (const plugin of listProviderPlugins()) {
    if (await isProviderConfigured(plugin, cfg)) {
      providers.push(plugin.id);
    }
  }
  return providers;
}

export async function resolveMessageProviderSelection(params: {
  cfg: ClawdbotConfig;
  provider?: string | null;
}): Promise<{ provider: MessageProviderId; configured: MessageProviderId[] }> {
  const normalized = normalizeMessageProvider(params.provider);
  if (normalized) {
    if (!isKnownProvider(normalized)) {
      throw new Error(`Unknown provider: ${normalized}`);
    }
    return {
      provider: normalized,
      configured: await listConfiguredMessageProviders(params.cfg),
    };
  }

  const configured = await listConfiguredMessageProviders(params.cfg);
  if (configured.length === 1) {
    return { provider: configured[0], configured };
  }
  if (configured.length === 0) {
    throw new Error("Provider is required (no configured providers detected).");
  }
  throw new Error(
    `Provider is required when multiple providers are configured: ${configured.join(
      ", ",
    )}`,
  );
}
