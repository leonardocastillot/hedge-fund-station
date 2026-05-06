import { app } from 'electron';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';

const CONFIG_FILE = 'marketing-ai.json';
const DEFAULT_LIVE_MODEL = 'gemini-3.1-flash-live-preview';
const FALLBACK_LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';
const DEFAULT_VOICE_NAME = 'Kore';

interface GeminiLiveConfig {
  geminiApiKey?: string;
  liveModel?: string;
}

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

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readLocalEnvValue(key: string): string {
  const candidatePaths = [
    path.join(process.cwd(), '.env'),
    path.join(app.getAppPath(), '.env')
  ];

  for (const envPath of candidatePaths) {
    if (!fs.existsSync(envPath)) {
      continue;
    }

    const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex <= 0) {
        continue;
      }

      const envKey = trimmed.slice(0, separatorIndex).trim();
      if (envKey !== key) {
        continue;
      }

      const rawValue = trimmed.slice(separatorIndex + 1).trim();
      return rawValue.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
    }
  }

  return '';
}

export class GeminiLiveVoiceManager {
  private readonly configPath: string;

  constructor() {
    this.configPath = path.join(app.getPath('userData'), CONFIG_FILE);
  }

  getStatus(): GeminiLiveStatus {
    const apiKey = this.getApiKey();
    return {
      isConfigured: Boolean(apiKey),
      model: this.getLiveModel(),
      fallbackModel: FALLBACK_LIVE_MODEL,
      keyPreview: apiKey ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}` : null
    };
  }

  async createToken(params: GeminiLiveTokenRequest = {}): Promise<GeminiLiveTokenResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('Gemini Live is not configured. Add GEMINI_API_KEY or GOOGLE_API_KEY, or save a Gemini key in Marketing AI settings.');
    }

    const model = params.model?.trim() || this.getLiveModel();
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

  private getLiveModel(): string {
    const config = this.readConfig();
    return config.liveModel || process.env.GEMINI_LIVE_MODEL || DEFAULT_LIVE_MODEL;
  }

  private getApiKey(): string {
    const config = this.readConfig();
    return config.geminiApiKey
      || process.env.GEMINI_API_KEY
      || process.env.GOOGLE_API_KEY
      || readLocalEnvValue('GEMINI_API_KEY')
      || readLocalEnvValue('GOOGLE_API_KEY')
      || '';
  }

  private readConfig(): GeminiLiveConfig {
    if (!fs.existsSync(this.configPath)) {
      return {};
    }

    return safeJsonParse<GeminiLiveConfig>(fs.readFileSync(this.configPath, 'utf-8'), {});
  }
}
