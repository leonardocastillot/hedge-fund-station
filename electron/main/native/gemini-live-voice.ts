import { GoogleGenAI } from '@google/genai';
import {
  readAIConfig,
  resolveGeminiApiKey,
  resolveGeminiLiveModel
} from './ai-config-manager';

const DEFAULT_LIVE_MODEL = 'gemini-3.1-flash-live-preview';
const FALLBACK_LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';
const DEFAULT_VOICE_NAME = 'Kore';

export interface GeminiLiveStatus {
  isConfigured: boolean;
  model: string;
  fallbackModel: string;
  keyPreview: string | null;
}

export interface GeminiLiveTokenRequest {
  model?: string;
}

export interface GeminiLiveTokenResponse {
  token: string;
  model: string;
  fallbackModel: string;
  expiresAt: string;
  newSessionExpiresAt: string;
  voiceName: string;
}

export class GeminiLiveVoiceManager {
  getStatus(): GeminiLiveStatus {
    const config = readAIConfig();
    const apiKey = resolveGeminiApiKey(config);
    return {
      isConfigured: Boolean(apiKey),
      model: resolveGeminiLiveModel(config, DEFAULT_LIVE_MODEL),
      fallbackModel: FALLBACK_LIVE_MODEL,
      keyPreview: apiKey ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}` : null
    };
  }

  async createToken(params: GeminiLiveTokenRequest = {}): Promise<GeminiLiveTokenResponse> {
    const config = readAIConfig();
    const apiKey = resolveGeminiApiKey(config);
    if (!apiKey) {
      throw new Error('Gemini Live is not configured. Add GEMINI_API_KEY or GOOGLE_API_KEY, or save a Gemini key in Settings.');
    }

    const model = params.model?.trim() || resolveGeminiLiveModel(config, DEFAULT_LIVE_MODEL);
    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const newSessionExpireTime = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    const client = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: 'v1alpha' }
    });

    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        httpOptions: {
          apiVersion: 'v1alpha'
        }
      }
    });
    if (!token.name) {
      throw new Error('Gemini did not return an ephemeral Live token.');
    }

    return {
      token: token.name,
      model,
      fallbackModel: FALLBACK_LIVE_MODEL,
      expiresAt: expireTime,
      newSessionExpiresAt: newSessionExpireTime,
      voiceName: DEFAULT_VOICE_NAME
    };
  }

}
