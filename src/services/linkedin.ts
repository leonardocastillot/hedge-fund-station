// LinkedIn API Service
import { GATEWAY_HTTP_URL } from './backendConfig';

interface LinkedInCredentials {
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  expiresAt?: number;
}

interface LinkedInPost {
  text: string;
  imageUrl?: string;
  linkUrl?: string;
}

const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const REDIRECT_URI = 'http://localhost:5173/linkedin/callback'; // Vite dev server

// Backend proxy URL (to avoid CORS)
const BACKEND_URL = GATEWAY_HTTP_URL;

export class LinkedInService {
  private credentials: LinkedInCredentials | null = null;

  constructor() {
    this.loadCredentials();
  }

  private loadCredentials() {
    const saved = localStorage.getItem('linkedin_credentials');
    if (saved) {
      this.credentials = JSON.parse(saved);
    }
  }

  private saveCredentials() {
    if (this.credentials) {
      localStorage.setItem('linkedin_credentials', JSON.stringify(this.credentials));
    }
  }

  // Force reload credentials from localStorage
  reloadCredentials() {
    this.loadCredentials();
  }

  setCredentials(clientId: string, clientSecret: string) {
    this.credentials = {
      clientId,
      clientSecret,
      accessToken: this.credentials?.accessToken,
      expiresAt: this.credentials?.expiresAt
    };
    this.saveCredentials();
  }

  // Set access token directly (for manual tokens)
  setAccessToken(token: string) {
    const trimmedToken = token.trim();
    this.credentials = {
      clientId: this.credentials?.clientId || '',
      clientSecret: this.credentials?.clientSecret || '',
      accessToken: trimmedToken,
      expiresAt: Date.now() + (60 * 24 * 60 * 60 * 1000) // 60 days
    };
    this.saveCredentials();
    console.log('✅ Token guardado en servicio:', {
      tokenLength: trimmedToken.length,
      tokenPreview: trimmedToken.substring(0, 20) + '...'
    });
  }

  getCredentials(): LinkedInCredentials | null {
    return this.credentials;
  }

  clearCredentials() {
    this.credentials = null;
    localStorage.removeItem('linkedin_credentials');
  }

  isConfigured(): boolean {
    return !!(this.credentials?.clientId && this.credentials?.clientSecret) || !!this.credentials?.accessToken;
  }

  isAuthenticated(): boolean {
    if (!this.credentials?.accessToken) {
      return false;
    }
    if (!this.credentials?.expiresAt) {
      return true; // Manual tokens don't expire (or have long expiry)
    }
    return Date.now() < this.credentials.expiresAt;
  }

  // Generate OAuth URL
  getAuthUrl(): string {
    if (!this.credentials?.clientId) {
      throw new Error('Client ID not configured');
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.credentials.clientId,
      redirect_uri: REDIRECT_URI,
      scope: 'openid profile email w_member_social',
      state: Math.random().toString(36).substring(7)
    });

    return `${LINKEDIN_AUTH_URL}?${params.toString()}`;
  }

  // Exchange code for access token
  async exchangeCodeForToken(code: string): Promise<void> {
    if (!this.credentials?.clientId || !this.credentials?.clientSecret) {
      throw new Error('Credentials not configured');
    }

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret,
      redirect_uri: REDIRECT_URI
    });

    const response = await fetch(LINKEDIN_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get access token: ${error}`);
    }

    const data = await response.json();

    this.credentials.accessToken = data.access_token;
    this.credentials.expiresAt = Date.now() + (data.expires_in * 1000);
    this.saveCredentials();
  }

  // Get user profile (to get person URN) - via backend proxy
  async getUserProfile(): Promise<any> {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    const accessToken = this.credentials?.accessToken;
    if (!accessToken) {
      throw new Error('Access token unavailable');
    }

    console.log('📡 Fetching user profile via backend proxy:', `${BACKEND_URL}/api/linkedin/profile`);
    console.log('🔑 Using token:', accessToken.substring(0, 20) + '...');

    const response = await fetch(`${BACKEND_URL}/api/linkedin/profile`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    console.log('📬 Profile response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Profile fetch error:', errorText);
      throw new Error(`Failed to get user profile: ${response.status} - ${errorText}`);
    }

    const profile = await response.json();
    console.log('✅ Profile received:', profile);
    return profile;
  }

  // Publish post with text and optional image/link - via backend proxy
  async publishPost(post: LinkedInPost): Promise<any> {
    // Always reload credentials before publishing
    this.reloadCredentials();
    const accessToken = this.credentials?.accessToken;

    console.log('🔍 Publishing attempt:', {
      hasCredentials: !!this.credentials,
      hasToken: !!accessToken,
      tokenLength: accessToken?.length || 0,
      tokenPreview: accessToken?.substring(0, 20) || 'NO TOKEN',
      isAuthenticated: this.isAuthenticated()
    });

    if (!this.isAuthenticated() || !accessToken) {
      console.error('❌ Not authenticated. Credentials:', this.credentials);
      throw new Error('Not authenticated - Token missing or expired');
    }

    console.log('📤 Publishing via backend proxy:', `${BACKEND_URL}/api/linkedin/publish`);
    console.log('📝 Post data:', { text: post.text, linkUrl: post.linkUrl });

    const response = await fetch(`${BACKEND_URL}/api/linkedin/publish`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(post)
    });

    console.log('📬 Response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Backend/LinkedIn API Error:', errorText);

      let errorDetail;
      try {
        errorDetail = JSON.parse(errorText);
      } catch {
        errorDetail = { detail: errorText };
      }

      throw new Error(`Failed to publish: ${response.status} - ${errorDetail.detail || errorText}`);
    }

    const result = await response.json();
    console.log('✅ Post published successfully:', result);
    return result;
  }
}

// Export singleton instance
export const linkedInService = new LinkedInService();
