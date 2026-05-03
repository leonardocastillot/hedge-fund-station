import React from 'react';
import { GoogleGenAI, Modality, ThinkingLevel, type Session } from '@google/genai';

export type GeminiLiveVoiceStatus = 'idle' | 'missing-key' | 'connecting' | 'recording' | 'waiting-response' | 'responding' | 'ready' | 'error';

interface UseGeminiLiveVoiceOptions {
  autoDraftOnTurnComplete?: boolean;
  onConversationReady?: (conversation: GeminiLiveConversation) => void;
}

export interface GeminiLiveConversation {
  inputTranscript: string;
  outputTranscript: string;
  missionText: string;
}

interface LiveCloseDiagnostics {
  model: string;
  closeCode?: number;
  closeReason?: string;
  wasClean?: boolean;
  opened: boolean;
  sentAudioFrames: number;
  authMode: 'ephemeral-token';
  stage: string;
}

const LIVE_CONNECT_TIMEOUT_MS = 12000;
const LIVE_OPEN_TIMEOUT_MS = 2500;
const FIRST_AUDIO_FRAME_TIMEOUT_MS = 4500;
const RESPONSE_TIMEOUT_MS = 8000;

function uniqueModels(models: Array<string | undefined | null>): string[] {
  return Array.from(new Set(models.map((model) => model?.trim()).filter(Boolean) as string[]));
}

function formatLiveCloseDiagnostics(diagnostics: LiveCloseDiagnostics): string {
  const reason = diagnostics.closeReason ? diagnostics.closeReason.slice(0, 240) : 'empty';
  return [
    'Gemini Live closed before the voice turn could start.',
    `model=${diagnostics.model || 'unknown'}`,
    `code=${diagnostics.closeCode ?? 'unknown'}`,
    `reason=${reason}`,
    `wasClean=${diagnostics.wasClean ?? 'unknown'}`,
    `opened=${diagnostics.opened}`,
    `sentAudioFrames=${diagnostics.sentAudioFrames}`,
    `stage=${diagnostics.stage}`,
    `auth=${diagnostics.authMode}`
  ].join(' ');
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function float32ToPcm16(samples: Float32Array): ArrayBuffer {
  const output = new ArrayBuffer(samples.length * 2);
  const view = new DataView(output);

  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }

  return output;
}

function resampleFloat32(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (inputRate === outputRate) {
    return input;
  }

  const outputLength = Math.max(1, Math.round(input.length * outputRate / inputRate));
  const output = new Float32Array(outputLength);
  const ratio = (input.length - 1) / Math.max(1, outputLength - 1);

  for (let index = 0; index < outputLength; index += 1) {
    const sourcePosition = index * ratio;
    const sourceIndex = Math.floor(sourcePosition);
    const nextIndex = Math.min(input.length - 1, sourceIndex + 1);
    const fraction = sourcePosition - sourceIndex;
    output[index] = input[sourceIndex] + (input[nextIndex] - input[sourceIndex]) * fraction;
  }

  return output;
}

function pcm16ToFloat32(buffer: ArrayBuffer): Float32Array {
  const view = new DataView(buffer);
  const samples = new Float32Array(buffer.byteLength / 2);

  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(index * 2, true) / 0x8000;
  }

  return samples;
}

function appendTranscript(current: string, next?: string): string {
  const trimmed = next?.trim();
  if (!trimmed) {
    return current;
  }

  return [current, trimmed].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

export function useGeminiLiveVoice(options: UseGeminiLiveVoiceOptions = {}) {
  const { autoDraftOnTurnComplete = true, onConversationReady } = options;
  const [status, setStatus] = React.useState<GeminiLiveVoiceStatus>('idle');
  const [inputTranscript, setInputTranscript] = React.useState('');
  const [outputTranscript, setOutputTranscript] = React.useState('');
  const [error, setError] = React.useState('');
  const [durationSeconds, setDurationSeconds] = React.useState(0);
  const [audioLevel, setAudioLevel] = React.useState(0);
  const sessionRef = React.useRef<Session | null>(null);
  const mediaStreamRef = React.useRef<MediaStream | null>(null);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const sourceRef = React.useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = React.useRef<ScriptProcessorNode | null>(null);
  const playbackTimeRef = React.useRef(0);
  const timerRef = React.useRef<number | null>(null);
  const responseTimeoutRef = React.useRef<number | null>(null);
  const firstAudioFrameTimeoutRef = React.useRef<number | null>(null);
  const inputTranscriptRef = React.useRef('');
  const outputTranscriptRef = React.useRef('');
  const hasDeliveredRef = React.useRef(false);
  const stoppedInputRef = React.useRef(false);
  const closingRef = React.useRef(false);
  const failedRef = React.useRef(false);
  const turnCompleteRef = React.useRef(false);
  const liveOpenedRef = React.useRef(false);
  const sentAudioFramesRef = React.useRef(0);
  const activeModelRef = React.useRef('');
  const retryAttemptedRef = React.useRef(false);
  const audioPipeStartedRef = React.useRef(false);
  const connectionAttemptRef = React.useRef(0);
  const manualActivityStartedRef = React.useRef(false);
  const responseStartedRef = React.useRef(false);
  const stageRef = React.useRef<'idle' | 'token' | 'connecting' | 'opened' | 'activity-started' | 'streaming' | 'activity-ended' | 'waiting-response'>('idle');

  React.useEffect(() => {
    inputTranscriptRef.current = inputTranscript;
  }, [inputTranscript]);

  React.useEffect(() => {
    outputTranscriptRef.current = outputTranscript;
  }, [outputTranscript]);

  const stopTimer = React.useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearResponseTimeout = React.useCallback(() => {
    if (responseTimeoutRef.current !== null) {
      window.clearTimeout(responseTimeoutRef.current);
      responseTimeoutRef.current = null;
    }
  }, []);

  const clearFirstAudioFrameTimeout = React.useCallback(() => {
    if (firstAudioFrameTimeoutRef.current !== null) {
      window.clearTimeout(firstAudioFrameTimeoutRef.current);
      firstAudioFrameTimeoutRef.current = null;
    }
  }, []);

  const deliverConversation = React.useCallback(() => {
    if (hasDeliveredRef.current) {
      return;
    }

    const input = inputTranscriptRef.current.trim();
    const output = outputTranscriptRef.current.trim();
    if (!input && !output) {
      return;
    }

    hasDeliveredRef.current = true;
    onConversationReady?.({
      inputTranscript: input,
      outputTranscript: output,
      missionText: [
        input,
        output ? `Gemini Live planner notes: ${output}` : ''
      ].filter(Boolean).join('\n\n')
    });
  }, [onConversationReady]);

  const cleanup = React.useCallback((deliver = false) => {
    stopTimer();
    clearResponseTimeout();
    clearFirstAudioFrameTimeout();

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }

    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch {
        // The SDK may already have closed the socket.
      }
      sessionRef.current = null;
    }

    playbackTimeRef.current = 0;
    stoppedInputRef.current = false;
    closingRef.current = false;
    turnCompleteRef.current = false;
    liveOpenedRef.current = false;
    sentAudioFramesRef.current = 0;
    activeModelRef.current = '';
    retryAttemptedRef.current = false;
    audioPipeStartedRef.current = false;
    manualActivityStartedRef.current = false;
    responseStartedRef.current = false;
    stageRef.current = 'idle';
    setAudioLevel(0);

    if (deliver) {
      deliverConversation();
    }
  }, [clearFirstAudioFrameTimeout, clearResponseTimeout, deliverConversation, stopTimer]);

  React.useEffect(() => () => cleanup(false), [cleanup]);

  const playPcmAudio = React.useCallback((base64Audio: string, sampleRate = 24000) => {
    const context = audioContextRef.current;
    if (!context) {
      return;
    }

    const samples = pcm16ToFloat32(base64ToArrayBuffer(base64Audio));
    const audioBuffer = context.createBuffer(1, samples.length, sampleRate);
    audioBuffer.copyToChannel(samples, 0);

    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);

    const startAt = Math.max(context.currentTime + 0.03, playbackTimeRef.current);
    source.start(startAt);
    playbackTimeRef.current = startAt + audioBuffer.duration;
  }, []);

  const connectWithTimeout = React.useCallback(async (promise: Promise<Session>, model: string): Promise<Session> => {
    let timeoutId: number | null = null;
    let timedOut = false;

    promise.then((session) => {
      if (timedOut) {
        try {
          session.close();
        } catch {
          // The late connection is already closed.
        }
      }
    }).catch(() => undefined);

    try {
      return await Promise.race([
        promise,
        new Promise<Session>((_resolve, reject) => {
          timeoutId = window.setTimeout(() => {
            timedOut = true;
            reject(new Error(`Gemini Live connection timed out after ${LIVE_CONNECT_TIMEOUT_MS}ms. model=${model}`));
          }, LIVE_CONNECT_TIMEOUT_MS);
        })
      ]);
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    }
  }, []);

  const start = React.useCallback(async () => {
    if (status === 'connecting' || status === 'recording' || status === 'waiting-response' || status === 'responding') {
      return;
    }

    if (!window.electronAPI?.voice?.createLiveToken) {
      setError('Gemini Live voice bridge is not available in this build.');
      setStatus('error');
      return;
    }

    hasDeliveredRef.current = false;
    stoppedInputRef.current = false;
    closingRef.current = false;
    failedRef.current = false;
    turnCompleteRef.current = false;
    liveOpenedRef.current = false;
    sentAudioFramesRef.current = 0;
    activeModelRef.current = '';
    retryAttemptedRef.current = false;
    audioPipeStartedRef.current = false;
    manualActivityStartedRef.current = false;
    responseStartedRef.current = false;
    stageRef.current = 'idle';
    setInputTranscript('');
    setOutputTranscript('');
    setError('');
    setDurationSeconds(0);
    setStatus('connecting');

    try {
      const statusResult = await window.electronAPI.voice.getLiveStatus?.();
      if (statusResult && !statusResult.isConfigured) {
        throw new Error('missing-key: Gemini Live is not configured. Add GEMINI_API_KEY, GOOGLE_API_KEY, or save a Gemini key in Settings.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error('AudioContext is not available in this browser runtime.');
      }

      const audioContext = new AudioContextClass();
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      audioContextRef.current = audioContext;
      mediaStreamRef.current = stream;
      sourceRef.current = source;
      processorRef.current = processor;

      const startManualActivity = (session: Session, model: string) => {
        if (manualActivityStartedRef.current) {
          return;
        }

        session.sendRealtimeInput({ activityStart: {} });
        manualActivityStartedRef.current = true;
        stageRef.current = 'activity-started';
        clearFirstAudioFrameTimeout();
        firstAudioFrameTimeoutRef.current = window.setTimeout(() => {
          if (sentAudioFramesRef.current > 0 || stoppedInputRef.current || failedRef.current) {
            return;
          }

          failedRef.current = true;
          cleanup(false);
          setError(`Gemini Live connected, but no microphone audio frames were sent within ${FIRST_AUDIO_FRAME_TIMEOUT_MS}ms. model=${model}`);
          setStatus('error');
        }, FIRST_AUDIO_FRAME_TIMEOUT_MS);
      };

      const startAudioPipe = () => {
        if (audioPipeStartedRef.current) {
          return;
        }

        audioPipeStartedRef.current = true;
        source.connect(processor);
        processor.connect(audioContext.destination);
        processor.onaudioprocess = (event) => {
          if (!sessionRef.current) {
            return;
          }

          const samples = event.inputBuffer.getChannelData(0);
          let sum = 0;
          for (let index = 0; index < samples.length; index += 1) {
            sum += samples[index] * samples[index];
          }
          setAudioLevel(Math.min(1, Math.sqrt(sum / samples.length) * 5.2));

          try {
            sessionRef.current.sendRealtimeInput({
              audio: {
                data: arrayBufferToBase64(float32ToPcm16(resampleFloat32(samples, audioContext.sampleRate, 16000))),
                mimeType: 'audio/pcm;rate=16000'
              }
            });
            if (sentAudioFramesRef.current === 0) {
              clearFirstAudioFrameTimeout();
              stageRef.current = 'streaming';
            }
            sentAudioFramesRef.current += 1;
          } catch (audioError) {
            failedRef.current = true;
            const message = audioError instanceof Error ? audioError.message : 'Gemini Live rejected microphone audio.';
            cleanup(false);
            setError(`Gemini Live audio send failed. model=${activeModelRef.current || 'unknown'} sentAudioFrames=${sentAudioFramesRef.current} ${message}`);
            setStatus('error');
          }
        };

        timerRef.current = window.setInterval(() => {
          setDurationSeconds((current) => current + 1);
        }, 1000);
      };

      const connectLive = async (requestedModel?: string) => {
        const attemptId = connectionAttemptRef.current + 1;
        connectionAttemptRef.current = attemptId;
        liveOpenedRef.current = false;
        sentAudioFramesRef.current = 0;
        manualActivityStartedRef.current = false;
        clearFirstAudioFrameTimeout();

        stageRef.current = 'token';
        const token = await window.electronAPI.voice.createLiveToken({ model: requestedModel });
        activeModelRef.current = token.model;
        const ai = new GoogleGenAI({
          apiKey: token.token,
          httpOptions: { apiVersion: 'v1alpha' }
        });
        let resolveOpen: () => void = () => undefined;
        const openPromise = new Promise<void>((resolve) => {
          resolveOpen = resolve;
        });

        stageRef.current = 'connecting';
        const session = await connectWithTimeout(ai.live.connect({
          model: token.model,
          config: {
            responseModalities: [Modality.AUDIO],
            temperature: 0.45,
            realtimeInputConfig: {
              automaticActivityDetection: {
                disabled: true
              }
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            thinkingConfig: token.model.includes('3.1')
              ? { thinkingLevel: ThinkingLevel.LOW }
              : token.model.includes('2.5')
                ? { thinkingBudget: 0 }
                : undefined,
            systemInstruction: {
              parts: [
                {
                  text: [
                    'You are the Gemini Live voice planner inside Hedge Fund Station.',
                    'Speak naturally in Spanish unless the operator asks otherwise.',
                    'Your job is to clarify the operator mission and prepare it for Codex CLI review.',
                    'You must not execute commands, change files, change credentials, place trades, or imply that anything has already run.',
                    'When the mission is clear, summarize the objective, the Codex prompt intent, suggested safe commands, guardrails, and that human approval is required before execution.'
                  ].join(' ')
                }
              ]
            },
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: token.voiceName
                }
              }
            }
          },
          callbacks: {
            onopen: () => {
              if (attemptId === connectionAttemptRef.current) {
                liveOpenedRef.current = true;
                stageRef.current = 'opened';
                resolveOpen();
              }
            },
            onmessage: (message) => {
              const serverContent = message.serverContent;

              if (serverContent?.inputTranscription?.text) {
                setInputTranscript((current) => appendTranscript(current, serverContent.inputTranscription?.text));
              }

              if (serverContent?.outputTranscription?.text) {
                responseStartedRef.current = true;
                clearResponseTimeout();
                setOutputTranscript((current) => appendTranscript(current, serverContent.outputTranscription?.text));
                setStatus('responding');
              }

              const parts = serverContent?.modelTurn?.parts || [];
              for (const part of parts) {
                const inlineData = part.inlineData;
                if (inlineData?.data && inlineData.mimeType?.startsWith('audio/')) {
                  responseStartedRef.current = true;
                  clearResponseTimeout();
                  const rateMatch = inlineData.mimeType.match(/rate=(\d+)/);
                  playPcmAudio(inlineData.data, rateMatch ? Number(rateMatch[1]) : 24000);
                  setStatus('responding');
                }
              }

              if (serverContent?.turnComplete) {
                clearResponseTimeout();
                turnCompleteRef.current = true;
                setStatus('ready');
                closingRef.current = true;
                if (sessionRef.current) {
                  try {
                    sessionRef.current.close();
                  } catch {
                    // The SDK may already have closed the socket.
                  }
                  sessionRef.current = null;
                }
                if (autoDraftOnTurnComplete) {
                  window.setTimeout(deliverConversation, 250);
                }
              }
            },
            onerror: (event) => {
              if (attemptId !== connectionAttemptRef.current) {
                return;
              }

              const message = event instanceof ErrorEvent && event.message ? event.message : 'Gemini Live voice session failed.';
              const stage = stageRef.current;
              const model = activeModelRef.current || 'unknown';
              const sentAudioFrames = sentAudioFramesRef.current;
              failedRef.current = true;
              cleanup(true);
              setError(`${message} model=${model} sentAudioFrames=${sentAudioFrames} stage=${stage}`);
              setStatus('error');
            },
            onclose: (event) => {
              if (attemptId !== connectionAttemptRef.current || failedRef.current) {
                return;
              }

              if (closingRef.current || turnCompleteRef.current) {
                setStatus('ready');
                return;
              }

              const diagnostics = formatLiveCloseDiagnostics({
                model: token.model,
                closeCode: event.code,
                closeReason: event.reason,
                wasClean: event.wasClean,
                opened: liveOpenedRef.current,
                sentAudioFrames: sentAudioFramesRef.current,
                stage: stageRef.current,
                authMode: 'ephemeral-token'
              });

              failedRef.current = true;
              cleanup(false);
              setError(diagnostics);
              setStatus('error');
            }
          }
        }), token.model);

        if (attemptId !== connectionAttemptRef.current || failedRef.current) {
          try {
            session.close();
          } catch {
            // A newer fallback attempt owns the active connection.
          }
          return;
        }

        sessionRef.current = session;
        if (stoppedInputRef.current) {
          closingRef.current = true;
          try {
            session.close();
          } catch {
            // The SDK may already have closed the socket.
          }
          sessionRef.current = null;
          setStatus('ready');
          deliverConversation();
          return;
        }

        if (!liveOpenedRef.current) {
          await Promise.race([
            openPromise,
            new Promise<void>((_resolve, reject) => {
              window.setTimeout(() => {
                reject(new Error(`Gemini Live did not report onopen after ${LIVE_OPEN_TIMEOUT_MS}ms. model=${token.model}`));
              }, LIVE_OPEN_TIMEOUT_MS);
            })
          ]);
        }

        startManualActivity(session, token.model);
        startAudioPipe();
        setStatus('recording');
      };

      await connectLive(statusResult?.model);
    } catch (liveError) {
      cleanup(false);
      const message = liveError instanceof Error ? liveError.message : 'Gemini Live voice failed to start.';
      if (message.startsWith('missing-key:')) {
        setError(message.replace('missing-key: ', ''));
        setStatus('missing-key');
      } else {
        failedRef.current = true;
        setError(message);
        setStatus('error');
      }
    }
  }, [autoDraftOnTurnComplete, cleanup, clearFirstAudioFrameTimeout, clearResponseTimeout, connectWithTimeout, deliverConversation, playPcmAudio, status]);

  const stop = React.useCallback(() => {
    if (stoppedInputRef.current) {
      return;
    }

    stoppedInputRef.current = true;
    if (sessionRef.current) {
      try {
        if (manualActivityStartedRef.current) {
          sessionRef.current.sendRealtimeInput({ activityEnd: {} });
          manualActivityStartedRef.current = false;
          stageRef.current = 'activity-ended';
        }
      } catch (activityError) {
        const message = activityError instanceof Error ? activityError.message : 'Gemini Live rejected activityEnd.';
        setError(`Gemini Live turn close failed. model=${activeModelRef.current || 'unknown'} sentAudioFrames=${sentAudioFramesRef.current} ${message}`);
        // The session may already be closed.
      }
    }

    stopTimer();
    clearFirstAudioFrameTimeout();

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    setAudioLevel(0);
    stageRef.current = 'waiting-response';
    setStatus((current) => current === 'recording' ? 'waiting-response' : current);
    clearResponseTimeout();
    responseTimeoutRef.current = window.setTimeout(() => {
      if (sessionRef.current) {
        closingRef.current = true;
        try {
          sessionRef.current.close();
        } catch {
          // The SDK may already have closed the socket.
        }
        sessionRef.current = null;
      }
      setStatus('ready');
      deliverConversation();
    }, RESPONSE_TIMEOUT_MS);
  }, [clearFirstAudioFrameTimeout, clearResponseTimeout, deliverConversation, stopTimer]);

  const reset = React.useCallback(() => {
    cleanup(false);
    hasDeliveredRef.current = false;
    failedRef.current = false;
    turnCompleteRef.current = false;
    inputTranscriptRef.current = '';
    outputTranscriptRef.current = '';
    setInputTranscript('');
    setOutputTranscript('');
    setError('');
    setDurationSeconds(0);
    setAudioLevel(0);
    setStatus('idle');
  }, [cleanup]);

  return {
    status,
    transcript: inputTranscript,
    inputTranscript,
    setTranscript: setInputTranscript,
    outputTranscript,
    error,
    durationSeconds,
    audioLevel,
    start,
    stop,
    reset
  };
}
