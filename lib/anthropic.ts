import Anthropic from '@anthropic-ai/sdk';
import { withApiKey } from './keys';

export async function withAnthropicClient<T>(
  fn: (client: Anthropic) => Promise<T> | T,
): Promise<T> {
  return withApiKey((key) => {
    const client = new Anthropic({
      apiKey: key,
      dangerouslyAllowBrowser: true,
      maxRetries: 0,
      timeout: 120_000,
    });
    return fn(client);
  });
}
