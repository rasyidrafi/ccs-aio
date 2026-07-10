export const PRICING_VERSION = 'official-standard-2026-07-10-v1';

export type PricingConfidence =
  | 'exact'
  | 'standard-assumed'
  | 'provider-assumed'
  | 'fallback'
  | 'unsupported';

export type PricingContextTier = 'standard' | 'long';

interface PricingRates {
  inputPerMillion: number;
  cachedInputPerMillion: number;
  cacheCreationPerMillion: number;
  outputPerMillion: number;
}

interface ModelPricing {
  rates: PricingRates;
  serviceTiers?: Record<string, PricingRates>;
  longContextThreshold?: number;
}

export interface CalculatePricingInput {
  model: string;
  provider?: string;
  serviceTier?: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheCreationTokens: number;
  sourceCost?: number;
}

export interface PricingResult {
  provider: string;
  serviceTier: string;
  pricingVersion: string;
  pricingConfidence: PricingConfidence;
  pricingContextTier: PricingContextTier;
  uncachedInputTokens: number;
  inputCost: number;
  cachedInputCost: number;
  cacheCreationCost: number;
  outputCost: number;
  cost: number;
}

const rates = (
  inputPerMillion: number,
  cachedInputPerMillion: number,
  outputPerMillion: number,
  cacheCreationPerMillion = 0
): PricingRates => ({
  inputPerMillion,
  cachedInputPerMillion,
  cacheCreationPerMillion,
  outputPerMillion,
});

const OPENAI: Record<string, ModelPricing> = {
  'gpt-5.6-sol': { rates: rates(5, 0.5, 30, 6.25) },
  'gpt-5.6-terra': { rates: rates(2.5, 0.25, 15, 3.125) },
  'gpt-5.6-luna': { rates: rates(1, 0.1, 6, 1.25) },
  'gpt-5.5': {
    rates: rates(5, 0.5, 30),
    longContextThreshold: 272_000,
    serviceTiers: {
      batch: rates(2.5, 0.25, 15),
      flex: rates(2.5, 0.25, 15),
      priority: rates(12.5, 1.25, 75),
    },
  },
  'gpt-5.4': {
    rates: rates(2.5, 0.25, 15),
    longContextThreshold: 272_000,
    serviceTiers: {
      batch: rates(1.25, 0.13, 7.5),
      flex: rates(1.25, 0.13, 7.5),
      priority: rates(5, 0.5, 30),
    },
  },
  'gpt-5.4-mini': {
    rates: rates(0.75, 0.075, 4.5),
    serviceTiers: {
      batch: rates(0.375, 0.0375, 2.25),
      flex: rates(0.375, 0.0375, 2.25),
      priority: rates(1.5, 0.15, 9),
    },
  },
  'gpt-5.4-nano': {
    rates: rates(0.2, 0.02, 1.25),
    serviceTiers: {
      batch: rates(0.1, 0.01, 0.625),
      flex: rates(0.1, 0.01, 0.625),
    },
  },
  'gpt-5.3-codex': { rates: rates(1.75, 0.175, 14) },
  'gpt-5.3-codex-spark': { rates: rates(1.75, 0.175, 14) },
  'gpt-5.2': {
    rates: rates(1.75, 0.175, 14),
    serviceTiers: {
      batch: rates(0.875, 0.0875, 7),
      flex: rates(0.875, 0.0875, 7),
      priority: rates(3.5, 0.35, 28),
    },
  },
  'gpt-5.1': {
    rates: rates(1.25, 0.125, 10),
    serviceTiers: {
      batch: rates(0.625, 0.0625, 5),
      flex: rates(0.625, 0.0625, 5),
      priority: rates(2.5, 0.25, 20),
    },
  },
  'gpt-5': {
    rates: rates(1.25, 0.125, 10),
    serviceTiers: {
      batch: rates(0.625, 0.0625, 5),
      flex: rates(0.625, 0.0625, 5),
      priority: rates(2.5, 0.25, 20),
    },
  },
  'gpt-5-codex': { rates: rates(1.25, 0.125, 10) },
  'gpt-5-mini': {
    rates: rates(0.25, 0.025, 2),
    serviceTiers: {
      batch: rates(0.125, 0.0125, 1),
      flex: rates(0.125, 0.0125, 1),
      priority: rates(0.45, 0.045, 3.6),
    },
  },
  'gpt-5-nano': {
    rates: rates(0.05, 0.005, 0.4),
    serviceTiers: {
      batch: rates(0.025, 0.0025, 0.2),
      flex: rates(0.025, 0.0025, 0.2),
    },
  },
};

const ZAI: Record<string, ModelPricing> = {
  'glm-5.2': { rates: rates(1.4, 0.26, 4.4) },
  'glm-5.1': { rates: rates(1.4, 0.26, 4.4) },
  'glm-5': { rates: rates(1, 0.2, 3.2) },
  'glm-5-turbo': { rates: rates(1.2, 0.24, 4) },
  'glm-4.7': { rates: rates(0.6, 0.11, 2.2) },
  'glm-4.7-flashx': { rates: rates(0.07, 0.01, 0.4) },
  'glm-4.7-flash': { rates: rates(0, 0, 0) },
  'glm-4.6': { rates: rates(0.6, 0.11, 2.2) },
  'glm-4.5': { rates: rates(0.6, 0.11, 2.2) },
  'glm-4.5-x': { rates: rates(2.2, 0.45, 8.9) },
  'glm-4.5-air': { rates: rates(0.2, 0.03, 1.1) },
  'glm-4.5-airx': { rates: rates(1.1, 0.22, 4.5) },
  'glm-4.5-flash': { rates: rates(0, 0, 0) },
};

const ANTHROPIC: Record<string, ModelPricing> = {
  'claude-sonnet-4-6': { rates: rates(3, 0.3, 15, 3.75) },
  'claude-sonnet-4-6-thinking': { rates: rates(3, 0.3, 15, 3.75) },
  'claude-sonnet-4-5': { rates: rates(3, 0.3, 15, 3.75) },
  'claude-opus-4-6': { rates: rates(5, 0.5, 25, 6.25) },
};

const GOOGLE: Record<string, ModelPricing> = {
  'gemini-2.5-pro': { rates: rates(1.25, 0.3125, 10) },
  'gemini-2.5-flash': { rates: rates(0.3, 0.075, 2.5) },
  'gemini-2.5-flash-lite': { rates: rates(0.1, 0.025, 0.4) },
  'gemini-3-pro-preview': { rates: rates(2, 0, 12) },
  'gemini-3-flash-preview': { rates: rates(0.3, 0.075, 2.5) },
};

const MODEL_ALIASES: Record<string, string> = {
  'gemini-3.1-pro-preview': 'gemini-3-pro-preview',
  'gemini-3.1-flash-preview': 'gemini-3-flash-preview',
  'gemini-3-1-pro-preview': 'gemini-3-pro-preview',
  'gemini-3-1-flash-preview': 'gemini-3-flash-preview',
};

function normalizeModel(model: string): string {
  const normalized = model.trim().toLowerCase().split(':')[0];
  return MODEL_ALIASES[normalized] ?? normalized;
}

function normalizeProvider(provider: string | undefined, model: string): {
  provider: string;
  inferred: boolean;
} {
  const normalized = provider?.trim().toLowerCase() ?? '';
  if (['openai', 'codex', 'github-copilot', 'ghcp'].includes(normalized)) {
    return { provider: 'openai', inferred: false };
  }
  if (['zai', 'zhipu', 'zhipuai', 'glm'].includes(normalized)) {
    return { provider: 'zai', inferred: false };
  }
  if (['anthropic', 'claude'].includes(normalized)) {
    return { provider: 'anthropic', inferred: false };
  }
  if (['google', 'gemini', 'agy', 'antigravity'].includes(normalized)) {
    return { provider: 'google', inferred: false };
  }

  if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4-')) {
    return { provider: 'openai', inferred: true };
  }
  if (model.startsWith('glm-')) return { provider: 'zai', inferred: true };
  if (model.startsWith('claude-')) return { provider: 'anthropic', inferred: true };
  if (model.startsWith('gemini-')) return { provider: 'google', inferred: true };
  return { provider: normalized || 'unknown', inferred: true };
}

function normalizeServiceTier(serviceTier: string | undefined): {
  serviceTier: string;
  assumed: boolean;
} {
  const normalized = serviceTier?.trim().toLowerCase() ?? '';
  if (!normalized || normalized === 'default' || normalized === 'auto' || normalized === 'standard') {
    return { serviceTier: 'standard', assumed: !normalized };
  }
  if (normalized === 'priority' || normalized === 'flex' || normalized === 'batch') {
    return { serviceTier: normalized, assumed: false };
  }
  return { serviceTier: 'standard', assumed: true };
}

function registryForProvider(provider: string): Record<string, ModelPricing> | null {
  if (provider === 'openai') return OPENAI;
  if (provider === 'zai') return ZAI;
  if (provider === 'anthropic') return ANTHROPIC;
  if (provider === 'google') return GOOGLE;
  return null;
}

function inputIncludesCachedTokens(provider: string): boolean {
  return provider === 'openai' || provider === 'google';
}

function fallbackResult(
  input: CalculatePricingInput,
  provider: string,
  serviceTier: string,
  confidence: PricingConfidence
): PricingResult {
  const sourceCost = Number.isFinite(input.sourceCost) ? Math.max(0, input.sourceCost ?? 0) : 0;
  const totalInputTokens = Math.max(0, Math.trunc(input.inputTokens));
  const cachedInputTokens = inputIncludesCachedTokens(provider)
    ? Math.min(totalInputTokens, Math.max(0, Math.trunc(input.cachedInputTokens)))
    : Math.max(0, Math.trunc(input.cachedInputTokens));
  const uncachedInputTokens = inputIncludesCachedTokens(provider)
    ? Math.max(0, totalInputTokens - cachedInputTokens)
    : totalInputTokens;
  const estimatedInputCost = (uncachedInputTokens / 1_000_000) * 3;
  const estimatedCachedInputCost = (cachedInputTokens / 1_000_000) * 0.3;
  const estimatedCacheCreationCost =
    (Math.max(0, Math.trunc(input.cacheCreationTokens)) / 1_000_000) * 3.75;
  const estimatedOutputCost =
    (Math.max(0, Math.trunc(input.outputTokens)) / 1_000_000) * 15;
  const estimatedCost =
    estimatedInputCost + estimatedCachedInputCost + estimatedCacheCreationCost + estimatedOutputCost;
  const cost = sourceCost > 0 ? sourceCost : estimatedCost;
  return {
    provider,
    serviceTier,
    pricingVersion: PRICING_VERSION,
    pricingConfidence: confidence,
    pricingContextTier: 'standard',
    uncachedInputTokens,
    inputCost: sourceCost > 0 ? sourceCost : estimatedInputCost,
    cachedInputCost: sourceCost > 0 ? 0 : estimatedCachedInputCost,
    cacheCreationCost: sourceCost > 0 ? 0 : estimatedCacheCreationCost,
    outputCost: sourceCost > 0 ? 0 : estimatedOutputCost,
    cost,
  };
}

export function calculatePricing(input: CalculatePricingInput): PricingResult {
  const model = normalizeModel(input.model);
  const providerResult = normalizeProvider(input.provider, model);
  const serviceTierResult = normalizeServiceTier(input.serviceTier);
  const registry = registryForProvider(providerResult.provider);

  if (model.startsWith('gpt-image-') || model.startsWith('glm-image') || model.startsWith('cogview-')) {
    return fallbackResult(
      input,
      providerResult.provider,
      serviceTierResult.serviceTier,
      'unsupported'
    );
  }

  const modelPricing = registry?.[model];
  if (!modelPricing) {
    return fallbackResult(input, providerResult.provider, serviceTierResult.serviceTier, 'fallback');
  }

  const totalInputTokens = Math.max(0, Math.trunc(input.inputTokens));
  const reportedCachedTokens = Math.max(0, Math.trunc(input.cachedInputTokens));
  const cacheCreationTokens = Math.max(0, Math.trunc(input.cacheCreationTokens));
  const outputTokens = Math.max(0, Math.trunc(input.outputTokens));
  const cachedInputTokens = inputIncludesCachedTokens(providerResult.provider)
    ? Math.min(totalInputTokens, reportedCachedTokens)
    : reportedCachedTokens;
  const uncachedInputTokens = inputIncludesCachedTokens(providerResult.provider)
    ? Math.max(0, totalInputTokens - cachedInputTokens)
    : totalInputTokens;
  const baseRates = modelPricing.serviceTiers?.[serviceTierResult.serviceTier] ?? modelPricing.rates;
  const isLongContext =
    modelPricing.longContextThreshold !== undefined && totalInputTokens > modelPricing.longContextThreshold;
  const selectedRates = isLongContext
    ? rates(
        baseRates.inputPerMillion * 2,
        baseRates.cachedInputPerMillion * 2,
        baseRates.outputPerMillion * 1.5,
        baseRates.cacheCreationPerMillion * 2
      )
    : baseRates;
  const inputCost = (uncachedInputTokens / 1_000_000) * selectedRates.inputPerMillion;
  const cachedInputCost =
    (cachedInputTokens / 1_000_000) * selectedRates.cachedInputPerMillion;
  const cacheCreationCost =
    (cacheCreationTokens / 1_000_000) * selectedRates.cacheCreationPerMillion;
  const outputCost = (outputTokens / 1_000_000) * selectedRates.outputPerMillion;
  const pricingConfidence: PricingConfidence = providerResult.inferred
    ? 'provider-assumed'
    : serviceTierResult.assumed
      ? 'standard-assumed'
      : 'exact';

  return {
    provider: providerResult.provider,
    serviceTier: serviceTierResult.serviceTier,
    pricingVersion: PRICING_VERSION,
    pricingConfidence,
    pricingContextTier: isLongContext ? 'long' : 'standard',
    uncachedInputTokens,
    inputCost,
    cachedInputCost,
    cacheCreationCost,
    outputCost,
    cost: inputCost + cachedInputCost + cacheCreationCost + outputCost,
  };
}
