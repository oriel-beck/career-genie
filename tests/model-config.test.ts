import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildModelRequestConfig,
  defaultModelChoices,
  isModelUsable,
  pickDefaultModel,
  resolveEffort,
} from '../lib/model-config';
import { CallKind, Effort, type ModelInfo } from '../lib/types';

function model(partial: Partial<ModelInfo> & Pick<ModelInfo, 'id'>): ModelInfo {
  const { capabilities, ...rest } = partial;
  return {
    id: rest.id,
    display_name: rest.display_name ?? rest.id,
    max_input_tokens: rest.max_input_tokens ?? 200_000,
    max_tokens: rest.max_tokens ?? 8_192,
    capabilities: {
      structured_outputs: { supported: true },
      pdf_input: { supported: true },
      effort: {
        supported: true,
        [Effort.Low]: { supported: true },
        [Effort.Medium]: { supported: true },
        [Effort.High]: { supported: true },
      },
      ...capabilities,
    },
  };
}

const schema = {
  type: 'object' as const,
  additionalProperties: false as const,
  properties: {},
  required: [] as const,
};

test('rejects models without structured outputs or positive max_tokens', () => {
  assert.equal(
    isModelUsable(
      model({
        id: 'm1',
        capabilities: { structured_outputs: { supported: false } },
      }),
      CallKind.Analyze,
    ),
    false,
  );
  assert.equal(isModelUsable(model({ id: 'm2', max_tokens: 0 }), CallKind.Analyze), false);
});

test('parse requires pdf_input support', () => {
  assert.equal(
    isModelUsable(
      model({
        id: 'm3',
        capabilities: {
          structured_outputs: { supported: true },
          pdf_input: { supported: false },
        },
      }),
      CallKind.Parse,
    ),
    false,
  );
  assert.equal(isModelUsable(model({ id: 'm4' }), CallKind.Parse), true);
});

test('caps max_tokens and picks highest supported effort at or below desired', () => {
  const config = buildModelRequestConfig(
    CallKind.Tailor,
    model({
      id: 'm5',
      max_tokens: 4_000,
      capabilities: {
        structured_outputs: { supported: true },
        pdf_input: { supported: true },
        effort: {
          supported: true,
          [Effort.Low]: { supported: true },
          [Effort.Medium]: { supported: true },
        },
      },
    }),
    schema,
  );
  assert.equal(config.max_tokens, 4_000);
  assert.equal(config.effort, Effort.Medium);
});

test('tailor requests up to 16k tokens when the model allows it', () => {
  const config = buildModelRequestConfig(
    CallKind.Tailor,
    model({ id: 'm5b', max_tokens: 32_000 }),
    schema,
  );
  assert.equal(config.max_tokens, 16_384);
  assert.equal(config.effort, Effort.High);
});

test('interview requests up to 16k tokens when the model allows it', () => {
  const config = buildModelRequestConfig(
    CallKind.Interview,
    model({ id: 'm5c', max_tokens: 32_000 }),
    schema,
  );
  assert.equal(config.max_tokens, 16_384);
  assert.equal(config.effort, Effort.Medium);
});

test('omits effort when capability is absent', () => {
  const withoutEffort: ModelInfo = {
    id: 'm6',
    display_name: 'm6',
    max_input_tokens: 200_000,
    max_tokens: 8_192,
    capabilities: {
      structured_outputs: { supported: true },
      pdf_input: { supported: true },
    },
  };
  assert.equal(resolveEffort(withoutEffort, Effort.High), undefined);
  const config = buildModelRequestConfig(CallKind.Analyze, withoutEffort, schema);
  assert.equal('effort' in config, false);
});

test('defaults pick task-fit families from the live catalog', () => {
  const catalog = [
    model({ id: 'claude-haiku-4-5', display_name: 'Claude Haiku 4.5', max_tokens: 64_000 }),
    model({ id: 'claude-sonnet-5', display_name: 'Claude Sonnet 5', max_tokens: 128_000 }),
    model({ id: 'claude-opus-5', display_name: 'Claude Opus 5', max_tokens: 128_000 }),
    model({ id: 'claude-sonnet-4-6', display_name: 'Claude Sonnet 4.6', max_tokens: 128_000 }),
  ];
  assert.equal(pickDefaultModel(catalog, CallKind.Parse), 'claude-haiku-4-5');
  assert.equal(pickDefaultModel(catalog, CallKind.Analyze), 'claude-sonnet-5');
  assert.equal(pickDefaultModel(catalog, CallKind.Interview), 'claude-sonnet-5');
  assert.equal(pickDefaultModel(catalog, CallKind.Tailor), 'claude-sonnet-5');
});

test('defaultModelChoices keeps valid selections and replaces unusable ones', () => {
  const catalog = [
    model({ id: 'claude-haiku-4-5', display_name: 'Claude Haiku 4.5' }),
    model({
      id: 'claude-sonnet-5',
      display_name: 'Claude Sonnet 5',
      capabilities: {
        structured_outputs: { supported: true },
        pdf_input: { supported: false },
      },
    }),
  ];
  const choices = defaultModelChoices(catalog, {
    parse: 'missing-model',
    interview: 'claude-sonnet-5',
  });
  assert.equal(choices.parse, 'claude-haiku-4-5');
  assert.equal(choices.interview, 'claude-sonnet-5');
  assert.equal(choices.analyze, 'claude-sonnet-5');
  assert.equal(choices.tailor, 'claude-sonnet-5');
});
