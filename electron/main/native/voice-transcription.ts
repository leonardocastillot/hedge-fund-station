import {
  readLocalEnvValue,
  resolveGeminiApiKey
} from './ai-config-manager';

const OPENAI_TRANSCRIPTION_URL = 'https://api.openai.com/v1/audio/transcriptions';
const DEFAULT_MODEL = 'gpt-4o-mini-transcribe';
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_GEMINI_TRANSCRIPTION_MODEL = 'gemini-2.5-flash';
const GEMINI_TRANSCRIPTION_TIMEOUT_MS = 30000;
const GEMINI_PLANNER_TIMEOUT_MS = 20000;

type GeminiGenerateContentResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

function getOpenAIApiKey(): string {
  const envKey = process.env.OPENAI_API_KEY;
  if (envKey) {
    return envKey;
  }

  return readLocalEnvValue('OPENAI_API_KEY');
}

function getGeminiApiKey(): string {
  return resolveGeminiApiKey();
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

async function fetchGeminiJsonWithTimeout(
  url: string,
  body: unknown,
  timeoutMs: number,
  label: string
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export interface VoiceTranscriptionRequest {
  audio: ArrayBuffer;
  mimeType?: string;
}

export interface VoiceTranscriptionResponse {
  text: string;
  model: string;
  responseText?: string;
}

export class VoiceTranscriptionManager {
  async transcribe(request: VoiceTranscriptionRequest): Promise<VoiceTranscriptionResponse> {
    if (process.env.HEDGE_STATION_ENABLE_OPENAI_VOICE === '1') {
      return this.transcribeWithOpenAI(request);
    }

    return this.transcribeWithGemini(request);
  }

  private async transcribeWithOpenAI(request: VoiceTranscriptionRequest): Promise<VoiceTranscriptionResponse> {
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

  private extractGeminiText(payload: GeminiGenerateContentResponse): string {
    return (payload.candidates || [])
      .flatMap((candidate) => candidate.content?.parts || [])
      .map((part) => part.text || '')
      .join('\n')
      .trim();
  }

  private async generatePlannerResponse(apiKey: string, model: string, transcript: string): Promise<string> {
    try {
      const response = await fetchGeminiJsonWithTimeout(
        `${GEMINI_API_BASE_URL}/models/${model}:generateContent?key=${apiKey}`,
        {
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: [
                    'You are the Gemini voice planner inside Hedge Fund Station.',
                    'Answer naturally in Spanish unless the operator used English.',
                    'Do not claim that commands were run or files changed.',
                    'Given this operator voice request, reply with a concise useful planning response:',
                    transcript
                  ].join('\n')
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.55
          }
        },
        GEMINI_PLANNER_TIMEOUT_MS,
        'Gemini planner response'
      );

      if (!response.ok) {
        const errorText = await response.text();
        return `La transcripcion quedo lista, pero Gemini no pudo generar la respuesta de planner (${response.status}): ${errorText.slice(0, 240)}`;
      }

      const payload = await response.json() as GeminiGenerateContentResponse;
      return this.extractGeminiText(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gemini planner response failed.';
      return `La transcripcion quedo lista, pero Gemini no alcanzo a responder: ${message}`;
    }
  }

  private async transcribeWithGemini(request: VoiceTranscriptionRequest): Promise<VoiceTranscriptionResponse> {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      throw new Error('Missing Gemini API key. Add GEMINI_API_KEY, GOOGLE_API_KEY, or save a Gemini key in Settings.');
    }

    const mimeType = normalizeMimeType(request.mimeType);
    const audioBuffer = Buffer.from(request.audio);
    const model = process.env.GEMINI_TRANSCRIPTION_MODEL || DEFAULT_GEMINI_TRANSCRIPTION_MODEL;
    const response = await fetchGeminiJsonWithTimeout(
      `${GEMINI_API_BASE_URL}/models/${model}:generateContent?key=${apiKey}`,
      {
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: [
                  'Transcribe this voice note exactly.',
                  'Return only the transcript text.',
                  'The speaker may use Spanish, English, or both.'
                ].join(' ')
              },
              {
                inlineData: {
                  mimeType,
                  data: audioBuffer.toString('base64')
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0
        }
      },
      GEMINI_TRANSCRIPTION_TIMEOUT_MS,
      'Gemini transcription'
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini transcription failed (${response.status}): ${errorText}`);
    }

    const payload = await response.json() as GeminiGenerateContentResponse;
    const text = this.extractGeminiText(payload);

    if (!text) {
      throw new Error('Gemini returned an empty transcription.');
    }

    const responseText = await this.generatePlannerResponse(apiKey, model, text);

    return {
      text,
      model,
      responseText
    };
  }
}
