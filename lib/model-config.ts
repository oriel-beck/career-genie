import { CallKind, Effort, type ModelInfo } from './types';

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
