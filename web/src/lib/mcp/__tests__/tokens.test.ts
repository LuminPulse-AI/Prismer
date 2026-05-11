import { describe, expect, it } from 'vitest';
import { generateMcpTokenPlaintext, getMcpTokenPrefix, hashMcpToken } from '../tokens';

describe('MCP token helpers', () => {
  it('generates pmsk tokens with the expected UI prefix', () => {
    const token = generateMcpTokenPlaintext();

    expect(token).toMatch(/^pmsk_[A-Za-z0-9_-]+$/);
    expect(token).toHaveLength(48);
    expect(getMcpTokenPrefix(token)).toBe(token.slice(0, 13));
  });

  it('hashes tokens without preserving plaintext', () => {
    const token = 'pmsk_abcdefghijklmnopqrstuvwxyzABCDEFG';
    const hash = hashMcpToken(token);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashMcpToken(token)).toBe(hash);
  });
});
