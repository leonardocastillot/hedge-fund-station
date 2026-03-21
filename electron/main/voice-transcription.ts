import { app } from 'electron';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const OPENAI_TRANSCRIPTION_URL = 'https://api.openai.com/v1/audio/transcriptions';
const DEFAULT_MODEL = 'gpt-4o-mini-transcribe';

function parseDotEnv(contents: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith('\'') && value.endsWith('\''))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function loadLocalEnv(): Record<string, string> {
  const candidatePaths = [
    join(process.cwd(), '.env'),
    join(app.getAppPath(), '.env')
  ];

  for (const envPath of candidatePaths) {
    if (!existsSync(envPath)) {
      continue;
    }

    try {
      return parseDotEnv(readFileSync(envPath, 'utf8'));
    } catch (error) {
      console.warn(`Failed to read env file at ${envPath}:`, error);
    }
  }

  return {};
}

function getOpenAIApiKey(): string {
  const envKey = process.env.OPENAI_API_KEY;
  if (envKey) {
    return envKey;
  }

  const localEnv = loadLocalEnv();
  return localEnv.OPENAI_API_KEY || '';
}

function normalizeMimeType(mimeType?: string): string {
  if (!mimeType) {
    return 'audio/webm';
  }

  return mimeType.split(';')[0].trim() || 'audio/webm';
}

function extensionFromMimeType(mimeType: string): string {
  const normalized = normalizeMimeType(mimeType);

  switch (normalized) {
    case 'audio/webm':
      return 'webm';
    case 'audio/mp4':
    case 'audio/m4a':
      return 'm4a';
    case 'audio/mpeg':
      return 'mp3';
    case 'audio/wav':
    case 'audio/x-wav':
      return 'wav';
    case 'audio/ogg':
      return 'ogg';
    default:
      return 'webm';
  }
}

export interface VoiceTranscriptionRequest {
  audio: ArrayBuffer;
  mimeType?: string;
}

export interface VoiceTranscriptionResponse {
  text: string;
  model: string;
}

export class VoiceTranscriptionManager {
  async transcribe(request: VoiceTranscriptionRequest): Promise<VoiceTranscriptionResponse> {
    const apiKey = getOpenAIApiKey();
    if (!apiKey) {
      throw new Error('Missing OPENAI_API_KEY. Add it to your environment or local .env file.');
    }

    const mimeType = normalizeMimeType(request.mimeType);
    const extension = extensionFromMimeType(mimeType);
    const audioBuffer = Buffer.from(request.audio);
    const audioBlob = new Blob([audioBuffer], { type: mimeType });
    const formData = new FormData();

    formData.append('model', DEFAULT_MODEL);
    formData.append('file', audioBlob, `voice-command.${extension}`);

    const response = await fetch(OPENAI_TRANSCRIPTION_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Transcription failed (${response.status}): ${errorText}`);
    }

    const payload = await response.json() as { text?: string };
    const text = payload.text?.trim();

    if (!text) {
      throw new Error('OpenAI returned an empty transcription.');
    }

    return {
      text,
      model: DEFAULT_MODEL
    };
  }
}
