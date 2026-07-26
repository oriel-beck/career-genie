import { CallKind, Effort, type ModelChoice, type ModelInfo } from './types';

export type ObjectJsonSchema = Record<string, unknown> & { type: 'object' };

export type ModelRequestConfig<S extends ObjectJsonSchema = ObjectJsonSchema> = {
  model: string;
  max_tokens: number;
  effort?: Effort;
  schema: S;
};

const DESIRED_MAX_TOKENS: Record<CallKind, number> = {
  [CallKind.Parse]: 4_096,
  [CallKind.Interview]: 4_096,
  [CallKind.Analyze]: 4_096,
  // Nested resumeJson/coverLetterJson strings are token-heavy; 8k truncates rich profiles.
  [CallKind.Tailor]: 16_384,
};

const DESIRED_EFFORT: Record<CallKind, Effort> = {
  [CallKind.Parse]: Effort.Low,
  [CallKind.Interview]: Effort.Medium,
  [CallKind.Analyze]: Effort.Low,
  [CallKind.Tailor]: Effort.High,
};

const EFFORT_ORDER: Effort[] = [
  Effort.Low,
  Effort.Medium,
  Effort.High,
  Effort.Xhigh,
  Effort.Max,
];

/** Live-catalog family preference per task (no hardcoded model IDs). */
const ModelFamily = {
  Haiku: 'haiku',
  Sonnet: 'sonnet',
  Opus: 'opus',
  Fable: 'fable',
  Other: 'other',
} as const;
type ModelFamily = (typeof ModelFamily)[keyof typeof ModelFamily];

const PREFERRED_FAMILIES: Record<CallKind, readonly ModelFamily[]> = {
  // Structured PDF/DOCX extraction — Haiku is built for fast extraction.
  [CallKind.Parse]: [ModelFamily.Haiku, ModelFamily.Sonnet, ModelFamily.Opus, ModelFamily.Fable],
  // Conversational gap-filling — Sonnet for dialogue quality at medium effort.
  [CallKind.Interview]: [ModelFamily.Sonnet, ModelFamily.Opus, ModelFamily.Fable, ModelFamily.Haiku],
  // Noisy page cleanup + match judgment — Sonnet; Haiku is a solid extraction fallback.
  [CallKind.Analyze]: [ModelFamily.Sonnet, ModelFamily.Haiku, ModelFamily.Opus, ModelFamily.Fable],
  // Grounded resume/cover rewrite — Sonnet is the production writing default; Opus if absent.
  [CallKind.Tailor]: [ModelFamily.Sonnet, ModelFamily.Opus, ModelFamily.Fable, ModelFamily.Haiku],
};

export function isModelUsable(model: ModelInfo, kind: CallKind): boolean {
  if (model.capabilities.structured_outputs?.supported !== true) return false;
  if (!(model.max_tokens > 0)) return false;
  if (kind === CallKind.Parse && model.capabilities.pdf_input?.supported !== true) return false;
  return true;
}

export function resolveEffort(model: ModelInfo, desired: Effort): Effort | undefined {
  const capability = model.capabilities.effort;
  if (!capability || capability.supported !== true) return undefined;
  const desiredIndex = EFFORT_ORDER.indexOf(desired);
  for (let index = desiredIndex; index >= 0; index -= 1) {
    const candidate = EFFORT_ORDER[index]!;
    if (capability[candidate]?.supported === true) return candidate;
  }
  return undefined;
}

function detectFamily(model: ModelInfo): ModelFamily {
  const text = `${model.id} ${model.display_name}`.toLowerCase();
  if (text.includes('haiku')) return ModelFamily.Haiku;
  if (text.includes('sonnet')) return ModelFamily.Sonnet;
  if (text.includes('opus')) return ModelFamily.Opus;
  if (text.includes('fable') || text.includes('mythos')) return ModelFamily.Fable;
  return ModelFamily.Other;
}

function versionParts(id: string): number[] {
  return id.match(/\d+/g)?.map(Number) ?? [];
}

function compareVersionDesc(a: string, b: string): number {
  const left = versionParts(a);
  const right = versionParts(b);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (right[index] ?? 0) - (left[index] ?? 0);
    if (delta) return delta;
  }
  return a.length - b.length;
}

function rankForKind(kind: CallKind, a: ModelInfo, b: ModelInfo): number {
  const desired = DESIRED_EFFORT[kind];
  const effortScore = (model: ModelInfo) => (resolveEffort(model, desired) === desired ? 1 : 0);
  const effortDelta = effortScore(b) - effortScore(a);
  if (effortDelta) return effortDelta;
  const tokenDelta =
    Math.min(b.max_tokens, DESIRED_MAX_TOKENS[kind]) - Math.min(a.max_tokens, DESIRED_MAX_TOKENS[kind]);
  if (tokenDelta) return tokenDelta;
  return compareVersionDesc(a.id, b.id);
}

export function pickDefaultModel(models: ModelInfo[], kind: CallKind): string | undefined {
  const usable = models.filter((model) => isModelUsable(model, kind));
  if (!usable.length) return undefined;

  for (const family of PREFERRED_FAMILIES[kind]) {
    const inFamily = usable.filter((model) => detectFamily(model) === family);
    if (!inFamily.length) continue;
    inFamily.sort((a, b) => rankForKind(kind, a, b));
    return inFamily[0]!.id;
  }

  return [...usable].sort((a, b) => rankForKind(kind, a, b))[0]?.id;
}

/** Fill missing or unusable selections from the live catalog; keep valid user choices. */
export function defaultModelChoices(
  models: ModelInfo[],
  current: Partial<ModelChoice> = {},
): Partial<ModelChoice> {
  const next: Partial<ModelChoice> = { ...current };
  for (const kind of Object.values(CallKind)) {
    const existing = current[kind];
    const stillValid =
      !!existing && models.some((model) => model.id === existing && isModelUsable(model, kind));
    if (stillValid) continue;
    const picked = pickDefaultModel(models, kind);
    if (picked) next[kind] = picked;
    else delete next[kind];
  }
  return next;
}

export function buildModelRequestConfig<S extends ObjectJsonSchema>(
  kind: CallKind,
  model: ModelInfo,
  schema: S,
): ModelRequestConfig<S> {
  if (!isModelUsable(model, kind)) {
    throw new Error(`Model ${model.id} is unusable for ${kind}`);
  }
  const max_tokens = Math.min(DESIRED_MAX_TOKENS[kind], model.max_tokens);
  const effort = resolveEffort(model, DESIRED_EFFORT[kind]);
  return {
    model: model.id,
    max_tokens,
    ...(effort ? { effort } : {}),
    schema,
  };
}
