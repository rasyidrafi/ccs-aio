import { describe, expect, test } from 'bun:test';

import { calculatePricing } from '@/pricing';

describe('calculatePricing', () => {
  test('splits OpenAI cached input from total input', () => {
    const result = calculatePricing({
      provider: 'openai',
      serviceTier: 'standard',
      model: 'gpt-5.4',
      inputTokens: 80_459,
      cachedInputTokens: 78_848,
      cacheCreationTokens: 0,
      outputTokens: 24,
    });

    expect(result.uncachedInputTokens).toBe(1_611);
    expect(result.cost).toBeCloseTo(0.0240995, 10);
    expect(result.pricingConfidence).toBe('exact');
  });

  test('applies long-context rates above 272k', () => {
    const standard = calculatePricing({
      provider: 'openai',
      serviceTier: 'standard',
      model: 'gpt-5.4',
      inputTokens: 272_000,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 1_000,
    });
    const long = calculatePricing({
      provider: 'openai',
      serviceTier: 'standard',
      model: 'gpt-5.4',
      inputTokens: 272_001,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 1_000,
    });

    expect(standard.pricingContextTier).toBe('standard');
    expect(long.pricingContextTier).toBe('long');
    expect(long.cost).toBeCloseTo((272_001 * 5 + 1_000 * 22.5) / 1_000_000, 10);
  });

  test('uses additive cached input for Z.AI', () => {
    const result = calculatePricing({
      provider: 'zai',
      serviceTier: 'standard',
      model: 'glm-4.7',
      inputTokens: 1_000,
      cachedInputTokens: 2_000,
      cacheCreationTokens: 0,
      outputTokens: 100,
    });

    expect(result.uncachedInputTokens).toBe(1_000);
    expect(result.cost).toBeCloseTo((1_000 * 0.6 + 2_000 * 0.11 + 100 * 2.2) / 1_000_000, 10);
  });

  test('preserves source cost for unsupported image models', () => {
    const result = calculatePricing({
      provider: 'openai',
      model: 'gpt-image-2',
      inputTokens: 100,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 100,
      sourceCost: 1.23,
    });

    expect(result.cost).toBe(1.23);
    expect(result.pricingConfidence).toBe('unsupported');
  });
});
