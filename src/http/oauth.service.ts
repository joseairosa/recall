/**
 * OAuth 2.0 Service for Claude Desktop Integration
 *
 * Implements OAuth 2.0 Authorization Code flow for remote MCP connections.
 * This allows Claude Desktop to authenticate users via the recallmcp.com login page.
 *
 * Flow:
 * 1. Claude Desktop redirects to /oauth/authorize
 * 2. User logs in via Firebase (GitHub/Google)
 * 3. Server generates authorization code
 * 4. Claude Desktop exchanges code for access token
 * 5. Access token is used for MCP requests
 */

import { randomBytes, createHash } from 'crypto';
import { StorageClient } from '../persistence/storage-client.js';

// OAuth configuration
const OAUTH_CONFIG = {
  // Authorization codes expire after 10 minutes
  CODE_EXPIRY_SECONDS: 600,
  // Access tokens expire after 30 days
  ACCESS_TOKEN_EXPIRY_SECONDS: 30 * 24 * 60 * 60,
  // Refresh tokens expire after 90 days
  REFRESH_TOKEN_EXPIRY_SECONDS: 90 * 24 * 60 * 60,
};

// Registered OAuth clients (for now, just Claude Desktop)
const OAUTH_CLIENTS: Record<string, OAuthClient> = {
  'claude-desktop': {
    clientId: 'claude-desktop',
    clientSecret: null, // Public client, no secret required
    name: 'Claude Desktop',
    redirectUris: [
      'https://claude.ai/oauth/callback',
      'http://localhost:*/oauth/callback',
      // Claude Desktop may use various callback URLs
    ],
    isPublic: true,
  },
};

interface OAuthClient {
  clientId: string;
  clientSecret: string | null;
  name: string;
  redirectUris: string[];
  isPublic: boolean;
}

interface AuthorizationCode {
  code: string;
  clientId: string;
  tenantId: string;
  redirectUri: string;
  scope: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  expiresAt: number;
}

interface OAuthToken {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  scope: string;
}

/**
 * Generate a secure random string
 */
function generateSecureToken(length: number = 32): string {
  return randomBytes(length).toString('base64url');
}

/**
 * Verify PKCE code challenge
 */
function verifyCodeChallenge(
  codeVerifier: string,
  codeChallenge: string,
  method: string = 'S256'
): boolean {
  if (method === 'plain') {
    return codeVerifier === codeChallenge;
  }

  // S256: BASE64URL(SHA256(code_verifier))
  const hash = createHash('sha256').update(codeVerifier).digest('base64url');
  return hash === codeChallenge;
}

/**
 * Validate redirect URI against registered client
 */
function isValidRedirectUri(client: OAuthClient, redirectUri: string): boolean {
  // For Claude Desktop, we're flexible with redirect URIs
  // since it may use localhost with different ports
  for (const pattern of client.redirectUris) {
    if (pattern.includes('*')) {
      // Wildcard matching for localhost ports
      const regex = new RegExp('^' + pattern.replace('*', '\\d+') + '$');
      if (regex.test(redirectUri)) {
        return true;
      }
    } else if (redirectUri === pattern) {
      return true;
    }
  }

  // For public clients, also allow any https callback
  if (client.isPublic && redirectUri.startsWith('https://')) {
    return true;
  }

  return false;
}

/**
 * OAuth Service class
 */
export class OAuthService {
  private storageClient: StorageClient;

  constructor(storageClient: StorageClient) {
    this.storageClient = storageClient;
  }

  /**
   * Validate OAuth client
   */
  getClient(clientId: string): OAuthClient | null {
    return OAUTH_CLIENTS[clientId] || null;
  }

  /**
   * Generate authorization code after successful login
   */
  async generateAuthorizationCode(params: {
    clientId: string;
    tenantId: string;
    redirectUri: string;
    scope: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
  }): Promise<string> {
    const code = generateSecureToken(32);

    const authCode: AuthorizationCode = {
      code,
      clientId: params.clientId,
      tenantId: params.tenantId,
      redirectUri: params.redirectUri,
      scope: params.scope,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: params.codeChallengeMethod,
      expiresAt: Date.now() + OAUTH_CONFIG.CODE_EXPIRY_SECONDS * 1000,
    };

    // Store authorization code in Redis with expiry
    const key = `oauth:code:${code}`;
    await this.storageClient.set(key, JSON.stringify(authCode));
    await this.storageClient.expire(key, OAUTH_CONFIG.CODE_EXPIRY_SECONDS);

    console.log(`[OAuth] Generated auth code for tenant ${params.tenantId}`);
    return code;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(params: {
    code: string;
    clientId: string;
    redirectUri: string;
    codeVerifier?: string;
  }): Promise<OAuthToken | null> {
    // Retrieve and validate authorization code
    const codeData = await this.storageClient.get(`oauth:code:${params.code}`);
    if (!codeData) {
      console.log('[OAuth] Invalid or expired authorization code');
      return null;
    }

    const authCode: AuthorizationCode = JSON.parse(codeData);

    // Delete the code (one-time use)
    await this.storageClient.del(`oauth:code:${params.code}`);

    // Validate code hasn't expired
    if (Date.now() > authCode.expiresAt) {
      console.log('[OAuth] Authorization code expired');
      return null;
    }

    // Validate client ID matches
    if (authCode.clientId !== params.clientId) {
      console.log('[OAuth] Client ID mismatch');
      return null;
    }

    // Validate redirect URI matches
    if (authCode.redirectUri !== params.redirectUri) {
      console.log('[OAuth] Redirect URI mismatch');
      return null;
    }

    // Validate PKCE if code challenge was provided
    if (authCode.codeChallenge) {
      if (!params.codeVerifier) {
        console.log('[OAuth] Code verifier required but not provided');
        return null;
      }
      if (!verifyCodeChallenge(params.codeVerifier, authCode.codeChallenge, authCode.codeChallengeMethod)) {
        console.log('[OAuth] PKCE verification failed');
        return null;
      }
    }

    // Generate tokens
    const accessToken = generateSecureToken(32);
    const refreshToken = generateSecureToken(32);

    // Store access token mapping to tenant
    const accessKey = `oauth:access:${accessToken}`;
    await this.storageClient.set(accessKey, JSON.stringify({
      tenantId: authCode.tenantId,
      clientId: authCode.clientId,
      scope: authCode.scope,
      createdAt: Date.now(),
    }));
    await this.storageClient.expire(accessKey, OAUTH_CONFIG.ACCESS_TOKEN_EXPIRY_SECONDS);

    // Store refresh token
    const refreshKey = `oauth:refresh:${refreshToken}`;
    await this.storageClient.set(refreshKey, JSON.stringify({
      tenantId: authCode.tenantId,
      clientId: authCode.clientId,
      scope: authCode.scope,
      createdAt: Date.now(),
    }));
    await this.storageClient.expire(refreshKey, OAUTH_CONFIG.REFRESH_TOKEN_EXPIRY_SECONDS);

    console.log(`[OAuth] Issued tokens for tenant ${authCode.tenantId}`);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: OAUTH_CONFIG.ACCESS_TOKEN_EXPIRY_SECONDS,
      scope: authCode.scope,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<OAuthToken | null> {
    const tokenData = await this.storageClient.get(`oauth:refresh:${refreshToken}`);
    if (!tokenData) {
      console.log('[OAuth] Invalid or expired refresh token');
      return null;
    }

    const data = JSON.parse(tokenData);

    // Generate new access token
    const newAccessToken = generateSecureToken(32);

    // Store new access token
    const newAccessKey = `oauth:access:${newAccessToken}`;
    await this.storageClient.set(newAccessKey, JSON.stringify({
      tenantId: data.tenantId,
      clientId: data.clientId,
      scope: data.scope,
      createdAt: Date.now(),
    }));
    await this.storageClient.expire(newAccessKey, OAUTH_CONFIG.ACCESS_TOKEN_EXPIRY_SECONDS);

    console.log(`[OAuth] Refreshed access token for tenant ${data.tenantId}`);

    return {
      accessToken: newAccessToken,
      refreshToken, // Return same refresh token
      tokenType: 'Bearer',
      expiresIn: OAUTH_CONFIG.ACCESS_TOKEN_EXPIRY_SECONDS,
      scope: data.scope,
    };
  }

  /**
   * Validate access token and get tenant ID
   */
  async validateAccessToken(accessToken: string): Promise<{ tenantId: string; scope: string } | null> {
    const tokenData = await this.storageClient.get(`oauth:access:${accessToken}`);
    if (!tokenData) {
      return null;
    }

    const data = JSON.parse(tokenData);
    return {
      tenantId: data.tenantId,
      scope: data.scope,
    };
  }

  /**
   * Revoke tokens (logout)
   */
  async revokeToken(token: string, tokenType: 'access' | 'refresh'): Promise<void> {
    const key = tokenType === 'access' ? `oauth:access:${token}` : `oauth:refresh:${token}`;
    await this.storageClient.del(key);
    console.log(`[OAuth] Revoked ${tokenType} token`);
  }

  /**
   * Store pending authorization request (for the OAuth flow)
   */
  async storePendingAuth(state: string, params: {
    clientId: string;
    redirectUri: string;
    scope: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
  }): Promise<void> {
    const pendingKey = `oauth:pending:${state}`;
    await this.storageClient.set(pendingKey, JSON.stringify(params));
    await this.storageClient.expire(pendingKey, OAUTH_CONFIG.CODE_EXPIRY_SECONDS);
  }

  /**
   * Get and delete pending authorization request
   */
  async getPendingAuth(state: string): Promise<{
    clientId: string;
    redirectUri: string;
    scope: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
  } | null> {
    const data = await this.storageClient.get(`oauth:pending:${state}`);
    if (!data) {
      return null;
    }

    // Delete pending auth (one-time use)
    await this.storageClient.del(`oauth:pending:${state}`);

    return JSON.parse(data);
  }
}

// Export validation helper
export { isValidRedirectUri, OAUTH_CLIENTS };
