import { withAnthropicClient } from './anthropic';
import { withApiKey } from './keys';
import type { ModelInfo } from './types';

const CACHE_MS = 5 * 60 * 1000;
let cached: { key: string; at: number; models: ModelInfo[] } | undefined;

function support(value: { supported: boolean } | null | undefined) {
  return { supported: value?.supported === true };
}

async function keyFingerprint(): Promise<string> {
  return withApiKey(async (key) => {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
    return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
  });
}

function toModelInfo(model: {
  id: string;
  display_name: string;
  max_input_tokens: number | null;
  max_tokens: number | null;
  capabilities: {
    structured_outputs: { supported: boolean };
    pdf_input: { supported: boolean };
    effort: {
      supported: boolean;
      low: { supported: boolean };
      medium: { supported: boolean };
      high: { supported: boolean };
      xhigh: { supported: boolean } | null;
      max: { supported: boolean };
    };
    thinking: {
      supported: boolean;
      types: { adaptive: { supported: boolean }; enabled: { supported: boolean } };
    };
  } | null;
}): ModelInfo {
  const capabilities = model.capabilities;
  return {
    id: model.id,
    display_name: model.display_name,
    max_input_tokens: model.max_input_tokens ?? 0,
    max_tokens: model.max_tokens ?? 0,
    capabilities: {
      structured_outputs: support(capabilities?.structured_outputs),
      pdf_input: support(capabilities?.pdf_input),
      effort: {
        ...support(capabilities?.effort),
        low: support(capabilities?.effort.low),
        medium: support(capabilities?.effort.medium),
        high: support(capabilities?.effort.high),
        xhigh: support(capabilities?.effort.xhigh),
        max: support(capabilities?.effort.max),
      },
      thinking: {
        ...support(capabilities?.thinking),
        types: {
          adaptive: support(capabilities?.thinking.types.adaptive),
          enabled: support(capabilities?.thinking.types.enabled),
        },
      },
    },
  };
}

export function clearModelCache(): void {
  cached = undefined;
}

export async function listModels(): Promise<ModelInfo[]> {
  const key = await keyFingerprint();
  if (cached && cached.key === key && Date.now() - cached.at < CACHE_MS) return cached.models;

  const models = await withAnthropicClient(async (client) => {
    const result: ModelInfo[] = [];
    let after_id: string | undefined;
    do {
      const page = await client.models.list({ limit: 100, ...(after_id ? { after_id } : {}) });
      result.push(...page.data.map(toModelInfo));
      if (!page.has_more) return result;
      if (page.last_id === null) throw new Error('Invalid catalog response');
      after_id = page.last_id;
    } while (after_id);
    return result;
  });

  cached = { key, at: Date.now(), models };
  return models;
}
