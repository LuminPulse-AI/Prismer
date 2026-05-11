import { describe, expect, it } from 'vitest';
import { isBlockedIp } from '../ssrf';

describe('MCP SSRF address blocking', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.10',
    '169.254.169.254',
    '::1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ])('blocks %s', (address) => {
    expect(isBlockedIp(address)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '2001:4860:4860::8888',
    '2606:4700:4700::1111',
  ])('allows %s', (address) => {
    expect(isBlockedIp(address)).toBe(false);
  });
});
