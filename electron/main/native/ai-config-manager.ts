import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

const AI_CONFIG_FILE = 'hedge-fund-ai.json';
const DEFAULT_TEXT_MODEL = 'gemini-2.5-flash';
const DEFAULT_LIVE_MODEL = 'gemini-3.1-flash-live-preview';

export interface HedgeFundAIConfig {
  geminiApiKey?: string;
  textModel?: string;
  liveModel?: string;
}

export interface AIConfigStatus {
  isConfigured: boolean;
  hasGeminiApiKey: boolean;
  textModel: string;
  liveModel: string;
  keyPreview: string | null;
}

export interface AISaveGeminiApiKeyParams {
  apiKey: string;
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getConfigPath(): string {
  return path.join(app.getPath('userData'), AI_CONFIG_FILE);
}

export function readAIConfig(): HedgeFundAIConfig {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return {};
  }

  return safeJsonParse<HedgeFundAIConfig>(fs.readFileSync(configPath, 'utf-8'), {});
}

export function writeAIConfig(config: HedgeFundAIConfig): void {
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
}

export function readLocalEnvValue(key: string): string {
  const candidatePaths = [
    path.join(process.cwd(), '.env'),
    path.join(app.getAppPath(), '.env')
  ];

  for (const envPath of candidatePaths) {
    if (!fs.existsSync(envPath)) {
      continue;
    }

    let lines: string[];
    try {
      lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
    } catch (error) {
      console.warn(`Failed to read env file at ${envPath}:`, error);
      continue;
    }

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

export function resolveGeminiApiKey(config: HedgeFundAIConfig = readAIConfig()): string {
  return config.geminiApiKey
    || process.env.GEMINI_API_KEY
    || process.env.GOOGLE_API_KEY
    || readLocalEnvValue('GEMINI_API_KEY')
    || readLocalEnvValue('GOOGLE_API_KEY')
    || '';
}

export function resolveGeminiTextModel(config: HedgeFundAIConfig = readAIConfig(), fallback = DEFAULT_TEXT_MODEL): string {
  return config.textModel || process.env.GEMINI_TEXT_MODEL || fallback;
}

export function resolveGeminiLiveModel(config: HedgeFundAIConfig = readAIConfig(), fallback = DEFAULT_LIVE_MODEL): string {
  return config.liveModel || process.env.GEMINI_LIVE_MODEL || fallback;
}

export class AIConfigManager {
  getConfigStatus(): AIConfigStatus {
    const config = readAIConfig();
    const apiKey = resolveGeminiApiKey(config);

    return {
      isConfigured: Boolean(apiKey),
      hasGeminiApiKey: Boolean(apiKey),
      textModel: resolveGeminiTextModel(config),
      liveModel: resolveGeminiLiveModel(config),
      keyPreview: apiKey ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}` : null
    };
  }

  saveGeminiApiKey(apiKey: string): AIConfigStatus {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      throw new Error('Gemini API key is required');
    }

    const config = readAIConfig();
    config.geminiApiKey = trimmed;
    writeAIConfig(config);
    return this.getConfigStatus();
  }
}
