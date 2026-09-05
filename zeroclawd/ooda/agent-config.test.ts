/**
 * Unit tests for agent-config validation — exercises the shipped module.
 * Run: npx tsx --test agent-config.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateAgentConfig, buyAmountToLamports, KNOWN_PROVIDERS } from './agent-config.js';

const valid = {
  name: 'alpha',
  provider: 'deterministic',
  token: 'So11111111111111111111111111111111111111112',
  rpcMode: 'public',
  buyAmount: 1.5,
  wallet: '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV',
};

describe('validateAgentConfig', () => {
  it('accepts a full valid config', () => {
    const r = validateAgentConfig(valid);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.config.provider, 'deterministic');
    assert.equal(r.config.rpcMode, 'public');
    assert.equal(r.config.buyAmount, 1.5);
    assert.equal(r.config.token, valid.token);
  });

  it('rejects missing required fields', () => {
    for (const key of ['name', 'provider', 'token', 'rpcMode'] as const) {
      const bad = { ...valid, [key]: '' };
      const r = validateAgentConfig(bad);
      assert.equal(r.ok, false, `should reject empty ${key}`);
    }
  });

  it('rejects non-positive buyAmount', () => {
    assert.equal(validateAgentConfig({ ...valid, buyAmount: 0 }).ok, false);
    assert.equal(validateAgentConfig({ ...valid, buyAmount: -2 }).ok, false);
  });

  it('rejects unknown provider and rpc mode', () => {
    const p = validateAgentConfig({ ...valid, provider: 'not-real' });
    assert.equal(p.ok, false);
    if (!p.ok) assert.match(p.error, /not supported/);
    const m = validateAgentConfig({ ...valid, rpcMode: 'mainnet' });
    assert.equal(m.ok, false);
  });

  it('normalizes provider case', () => {
    const r = validateAgentConfig({ ...valid, provider: 'XAI' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.config.provider, 'xai');
  });

  it('lists known providers', () => {
    assert.ok(KNOWN_PROVIDERS.includes('deterministic'));
    assert.ok(KNOWN_PROVIDERS.includes('xai'));
  });
});

describe('buyAmountToLamports', () => {
  it('scales and caps', () => {
    assert.equal(buyAmountToLamports(0.25), 250_000);
    assert.equal(buyAmountToLamports(100), 5_000_000);
  });
});
