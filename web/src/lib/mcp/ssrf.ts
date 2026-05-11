import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { resolve4, resolve6 } from 'dns/promises';
import { isIP } from 'net';
import { McpToolError } from './errors';

const BLOCKED_HOSTS = new Set(['localhost', 'metadata.google.internal']);
const BLOCKED_IPV4_CIDRS: Array<[string, number]> = [
  ['127.0.0.0', 8],
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['169.254.0.0', 16],
];

export interface FetchUrlBufferOptions {
  maxBytes: number;
  timeoutMs: number;
  redirectLimit: number;
}

export interface FetchUrlBufferResult {
  buffer: Buffer;
  contentType: string | null;
  finalUrl: string;
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string,
  family: 4 | 6
) => void;

type LookupFunction = (
  hostname: string,
  options: unknown,
  callback: LookupCallback
) => void;

export async function validatePublicHttpUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new McpToolError('URL_INVALID', 'URL is invalid');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new McpToolError('URL_INVALID', 'Only http and https URLs are supported');
  }

  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname) || hostname.endsWith('.local')) {
    throw new McpToolError('URL_INVALID', 'URL host is not allowed');
  }

  const addresses = await resolveAllAddresses(hostname);
  validateResolvedAddresses(addresses);

  return url;
}

export async function fetchUrlBufferWithSsrfProtection(
  rawUrl: string,
  options: FetchUrlBufferOptions
): Promise<FetchUrlBufferResult> {
  let current = await validatePublicHttpUrl(rawUrl);

  for (let redirects = 0; redirects <= options.redirectLimit; redirects++) {
    const response = await requestOnce(current, options);
    const location = response.location;

    if (isRedirect(response.statusCode) && location) {
      current = await validatePublicHttpUrl(new URL(location, current).toString());
      continue;
    }

    if (isRedirect(response.statusCode)) {
      throw new McpToolError('URL_FETCH_FAILED', 'Redirect response did not include a location');
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new McpToolError('URL_FETCH_FAILED', `PDF download failed with HTTP ${response.statusCode}`);
    }

    return {
      buffer: response.buffer,
      contentType: response.contentType,
      finalUrl: current.toString(),
    };
  }

  throw new McpToolError('URL_FETCH_FAILED', 'Redirect limit exceeded');
}

async function requestOnce(
  url: URL,
  options: FetchUrlBufferOptions
): Promise<{
  statusCode: number;
  location: string | null;
  contentType: string | null;
  buffer: Buffer;
}> {
  const client = url.protocol === 'https:' ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const req = client(url, {
      method: 'GET',
      lookup: validatingLookup,
      timeout: options.timeoutMs,
      headers: {
        Accept: 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.1',
      },
    }, (res) => {
      const statusCode = res.statusCode || 0;
      const contentType = typeof res.headers['content-type'] === 'string'
        ? res.headers['content-type']
        : null;
      const location = typeof res.headers.location === 'string'
        ? res.headers.location
        : null;

      if (isRedirect(statusCode)) {
        res.resume();
        resolve({ statusCode, location, contentType, buffer: Buffer.alloc(0) });
        return;
      }

      const chunks: Buffer[] = [];
      let totalBytes = 0;

      res.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > options.maxBytes) {
          req.destroy(new McpToolError('URL_TOO_LARGE', 'PDF download exceeded the size limit'));
          return;
        }
        chunks.push(chunk);
      });

      res.on('end', () => {
        resolve({
          statusCode,
          location,
          contentType,
          buffer: Buffer.concat(chunks),
        });
      });
    });

    req.on('timeout', () => {
      req.destroy(new McpToolError('URL_FETCH_FAILED', 'PDF download timed out'));
    });

    req.on('error', (error) => {
      reject(error instanceof McpToolError
        ? error
        : new McpToolError('URL_FETCH_FAILED', error.message));
    });

    req.end();
  });
}

const validatingLookup: LookupFunction = (hostname, _options, callback) => {
  resolveAllAddresses(hostname)
    .then((addresses) => {
      validateResolvedAddresses(addresses);
      const chosen = addresses[0];
      callback(null, chosen, isIP(chosen) as 4 | 6);
    })
    .catch((error: unknown) => {
      callback(error instanceof Error ? error : new Error(String(error)), '', 4);
    });
};

async function resolveAllAddresses(hostname: string): Promise<string[]> {
  if (isIP(hostname)) {
    return [hostname];
  }

  const [v4, v6] = await Promise.all([
    resolve4(hostname).catch(() => [] as string[]),
    resolve6(hostname).catch(() => [] as string[]),
  ]);
  const addresses = [...v4, ...v6];

  if (addresses.length === 0) {
    throw new McpToolError('URL_INVALID', 'URL host did not resolve');
  }

  return addresses;
}

function validateResolvedAddresses(addresses: string[]): void {
  for (const address of addresses) {
    if (isBlockedIp(address)) {
      throw new McpToolError('URL_INVALID', `URL resolved to a blocked address: ${address}`);
    }
  }
}

export function isBlockedIp(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    return BLOCKED_IPV4_CIDRS.some(([base, bits]) => isIpv4InCidr(address, base, bits));
  }

  if (version === 6) {
    const parts = expandIpv6(address);
    if (!parts) return true;

    const mappedIpv4 = ipv4FromMappedIpv6(parts);
    if (mappedIpv4) return isBlockedIp(mappedIpv4);

    const isLoopback = parts.slice(0, 7).every((part) => part === 0) && parts[7] === 1;
    const first = parts[0];
    const isUniqueLocal = (first & 0xfe00) === 0xfc00;
    const isLinkLocal = (first & 0xffc0) === 0xfe80;
    return isLoopback || isUniqueLocal || isLinkLocal;
  }

  return true;
}

function isRedirect(statusCode: number): boolean {
  return [301, 302, 303, 307, 308].includes(statusCode);
}

function isIpv4InCidr(address: string, base: string, bits: number): boolean {
  const addressInt = ipv4ToInt(address);
  const baseInt = ipv4ToInt(base);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (addressInt & mask) === (baseInt & mask);
}

function ipv4ToInt(address: string): number {
  return address
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .reduce((acc, part) => ((acc << 8) + part) >>> 0, 0);
}

function expandIpv6(address: string): number[] | null {
  const [withoutZone] = address.split('%');
  const ipv4Match = withoutZone.match(/(.+:)(\d+\.\d+\.\d+\.\d+)$/);
  const normalized = ipv4Match
    ? `${ipv4Match[1]}${ipv4ToHextets(ipv4Match[2]).join(':')}`
    : withoutZone;
  const halves = normalized.split('::');

  if (halves.length > 2) return null;

  const left = halves[0] ? halves[0].split(':').filter(Boolean) : [];
  const right = halves[1] ? halves[1].split(':').filter(Boolean) : [];
  const missing = 8 - left.length - right.length;

  if (missing < 0) return null;

  const parts = [
    ...left,
    ...Array.from({ length: halves.length === 2 ? missing : 0 }, () => '0'),
    ...right,
  ];

  if (parts.length !== 8) return null;

  return parts.map((part) => Number.parseInt(part, 16));
}

function ipv4ToHextets(address: string): [string, string] {
  const parts = address.split('.').map((part) => Number.parseInt(part, 10));
  return [
    ((parts[0] << 8) + parts[1]).toString(16),
    ((parts[2] << 8) + parts[3]).toString(16),
  ];
}

function ipv4FromMappedIpv6(parts: number[]): string | null {
  const isMapped = parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff;
  if (!isMapped) return null;

  return [
    parts[6] >> 8,
    parts[6] & 0xff,
    parts[7] >> 8,
    parts[7] & 0xff,
  ].join('.');
}
