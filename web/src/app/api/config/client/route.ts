/**
 * GET /api/config/client
 * 
 * Returns runtime configuration for the frontend client.
 * Replaces build-time NEXT_PUBLIC_* variables with dynamic values.
 */

import { NextResponse } from 'next/server';

// Client configuration type
interface ClientConfig {
  aiEnabled: boolean;
  cdnDomain: string;
  githubClientId: string;
  googleClientId: string;
  appUrl: string;
  appName: string;
}

// Cached config to avoid reading on every request
let cachedConfig: ClientConfig | null = null;
let cacheTime = 0;
const CACHE_TTL = 60 * 1000; // 1 minute cache

export async function GET() {
  try {
    
    const now = Date.now();
    
    // Use cache
    if (cachedConfig && now - cacheTime < CACHE_TTL) {
      return NextResponse.json(cachedConfig);
    }
    
    // Return configuration needed by the client
    // Note: Only return safe, client-required configuration
    //
    // Security warning: Never return sensitive information like API Keys, Secrets, etc.
    // AI requests are proxied through /api/ai/*, client does not need API Key
    const config = {
      // AI configuration - Only return availability status, not API Key
      // Supports multiple naming formats
      aiEnabled: !!(
        process.env.NOVITA_API_KEY
        || process.env.OPENAI_API_KEY
        || process.env.OPENAI_APIKEY
        || process.env.AI_API_KEY
      ),
      
      // CDN configuration
      cdnDomain: process.env.CDN_DOMAIN || process.env.NEXT_PUBLIC_CDN_DOMAIN || '',
      
      // OAuth configuration (Client IDs are public, safe to expose)
      githubClientId: process.env.GITHUB_CLIENT_ID || process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID || '',
      googleClientId: process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
      
      // App configuration
      appUrl: process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      appName: process.env.APP_NAME || process.env.NEXT_PUBLIC_APP_NAME || 'Prismer Library',
    };
    
    // Update cache
    cachedConfig = config;
    cacheTime = now;
    
    return NextResponse.json(config);
  } catch (error) {
    console.error('[Config] Failed to get client config:', error);
    return NextResponse.json(
      { error: 'Failed to get config' },
      { status: 500 }
    );
  }
}
