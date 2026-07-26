'use client';

import { Select } from '@/components/select';
import { CallKind, type CallKind as CallKindValue, type ModelInfo } from '@/lib/types';

const callLabels: Record<CallKindValue, string> = {
  [CallKind.Parse]: 'Resume parsing',
  [CallKind.Interview]: 'Gap interview',
  [CallKind.Analyze]: 'Job analysis',
  [CallKind.Tailor]: 'Resume tailoring',
};

function compatible(model: ModelInfo, kind: CallKindValue): boolean {
  return model.max_tokens > 0 &&
    model.capabilities.structured_outputs?.supported === true &&
    (kind !== CallKind.Parse || model.capabilities.pdf_input?.supported === true);
}

export function ModelPicker({
  models,
  selected,
  onChange,
}: {
  models: ModelInfo[];
  selected: Partial<Record<CallKindValue, string>>;
  onChange: (kind: CallKindValue, model: string) => void;
}) {
  const kinds = Object.values(CallKind);
  return (
    <fieldset className="model-picker">
      <legend>Models</legend>
      {kinds.map((kind) => {
        const options = models.filter((model) => compatible(model, kind));
        const fieldId = `model-${kind}`;
        return (
          <label key={kind} htmlFor={fieldId}>
            {callLabels[kind]}
            <Select
              id={fieldId}
              value={selected[kind] ?? ''}
              onChange={(value) => onChange(kind, value)}
              options={[
                { value: '', label: 'Choose a compatible model' },
                ...options.map((model) => ({ value: model.id, label: model.display_name })),
              ]}
            />
            {!options.length && <span className="field-error">No compatible live model is available.</span>}
          </label>
        );
      })}
    </fieldset>
  );
}
