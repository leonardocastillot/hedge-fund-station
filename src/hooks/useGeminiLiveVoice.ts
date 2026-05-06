import React from 'react';
import {
  GoogleGenAI,
  Modality,
  type LiveServerMessage,
  type Session
} from '@google/genai';
import {
  buildGeminiOrchestratorSystemContext,
  createGeminiOrchestratorTools,
  normalizeGeminiLiveProposal,
  type GeminiLiveProposal,
  type GeminiOrchestratorCapabilityContext
} from '@/features/agents/orchestration/geminiOrchestrator';

export type GeminiLiveVoiceStatus =
  | 'idle'
  | 'missing-key'
  | 'token'
  | 'connecting'
  | 'live'
  | 'listening'
  | 'responding'
  | 'ready'
  | 'error';

interface UseGeminiLiveVoiceOptions {
  autoDraftOnTurnComplete?: boolean;
  onConversationReady?: (conversation: GeminiLiveConversation) => void;
  orchestratorContext?: GeminiOrchestratorCapabilityContext;
  onProposal?: (proposal: GeminiLiveProposal) => void;
  onToolResponse?: (proposal: GeminiLiveProposal) => void;
}

export interface GeminiLiveConversation {
  inputTranscript: string;
  outputTranscript: string;
  missionText: string;
}

interface LiveDiagnostics {
  model: string;
  fallbackModel: string;
  fallbackUsed: boolean;
  micPermission: 'unknown' | 'granted' | 'denied' | 'prompt';
  sentAudioChunks: number;
  receivedAudioChunks: number;
  stage: GeminiLiveVoiceStatus;
  closeCode: number | null;
  closeReason: string;
  lastToolProposal: string;
}

type WorkletAudioMessage = {
  samples: Float32Array;
  sampleRate: number;
};

const INPUT_AUDIO_RATE = 16000;
const DEFAULT_OUTPUT_AUDIO_RATE = 24000;
const MAX_CONNECT_ATTEMPTS = 2;
const MIC_PERMISSION_TIMEOUT_MS = 10000;
const RESPONSE_TIMEOUT_MS = 45000;
const LIVE_AUDIO_WORKLET_SOURCE = `
class GeminiLivePcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frames = [];
    this.frameCount = 0;
    this.targetFrameCount = 2048;
  }

  process(inputs) {
    const input = inputs[0];
    const channel = input && input[0];
    if (!channel) {
      return true;
    }

    const frame = new Float32Array(channel.length);
    frame.set(channel);
    this.frames.push(frame);
    this.frameCount += frame.length;

    if (this.frameCount >= this.targetFrameCount) {
      const samples = new Float32Array(this.frameCount);
      let offset = 0;
      for (const item of this.frames) {
        samples.set(item, offset);
        offset += item.length;
      }
      this.frames = [];
      this.frameCount = 0;
      this.port.postMessage({ samples, sampleRate }, [samples.buffer]);
    }

    return true;
  }
}

registerProcessor('gemini-live-pcm-processor', GeminiLivePcmProcessor);
`;

const initialDiagnostics: LiveDiagnostics = {
  model: '',
  fallbackModel: '',
  fallbackUsed: false,
  micPermission: 'unknown',
  sentAudioChunks: 0,
  receivedAudioChunks: 0,
  stage: 'idle',
  closeCode: null,
  closeReason: '',
  lastToolProposal: ''
};

function appendTranscript(current: string, next?: string): string {
  const trimmed = next?.trim();
  if (!trimmed) {
    return current;
  }

  return [current, trimmed].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return window.btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function parseAudioRate(mimeType?: string, fallback = DEFAULT_OUTPUT_AUDIO_RATE): number {
  const match = mimeType?.match(/rate=(\d+)/i);
  if (!match?.[1]) {
    return fallback;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resampleFloat32(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (inputRate === outputRate) {
    return input;
  }

  const ratio = inputRate / outputRate;
  const outputLength = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(outputLength);

  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index * ratio;
    const leftIndex = Math.floor(sourceIndex);
    const rightIndex = Math.min(input.length - 1, leftIndex + 1);
    const fraction = sourceIndex - leftIndex;
    output[index] = input[leftIndex] + (input[rightIndex] - input[leftIndex]) * fraction;
  }

  return output;
}

function float32ToPcm16Bytes(samples: Float32Array): Uint8Array {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    const value = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(index * 2, value, true);
  }
  return bytes;
}

function pcm16BytesToFloat32(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const samples = new Float32Array(Math.floor(bytes.byteLength / 2));
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(index * 2, true) / 0x8000;
  }
  return samples;
}

function calculateAudioLevel(samples: Float32Array): number {
  if (samples.length === 0) {
    return 0;
  }

  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    sum += samples[index] * samples[index];
  }
  return Math.min(1, Math.sqrt(sum / samples.length) * 8);
}

function getAudioContextClass(): typeof AudioContext | null {
  return window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext || null;
}

export function useGeminiLiveVoice(options: UseGeminiLiveVoiceOptions = {}) {
  const {
    onConversationReady,
    autoDraftOnTurnComplete = Boolean(onConversationReady),
    orchestratorContext,
    onProposal,
    onToolResponse
  } = options;
  const [status, setStatus] = React.useState<GeminiLiveVoiceStatus>('idle');
  const [inputTranscript, setInputTranscript] = React.useState('');
  const [outputTranscript, setOutputTranscript] = React.useState('');
  const [error, setError] = React.useState('');
  const [durationSeconds, setDurationSeconds] = React.useState(0);
  const [audioLevel, setAudioLevel] = React.useState(0);
  const [proposals, setProposals] = React.useState<GeminiLiveProposal[]>([]);
  const [diagnostics, setDiagnostics] = React.useState<LiveDiagnostics>(initialDiagnostics);

  const sessionRef = React.useRef<Session | null>(null);
  const inputAudioContextRef = React.useRef<AudioContext | null>(null);
  const outputAudioContextRef = React.useRef<AudioContext | null>(null);
  const inputStreamRef = React.useRef<MediaStream | null>(null);
  const workletNodeRef = React.useRef<AudioWorkletNode | null>(null);
  const inputSourceRef = React.useRef<MediaStreamAudioSourceNode | null>(null);
  const silentGainRef = React.useRef<GainNode | null>(null);
  const playingSourcesRef = React.useRef<Set<AudioBufferSourceNode>>(new Set());
  const playbackTimeRef = React.useRef(0);
  const timerRef = React.useRef<number | null>(null);
  const responseTimerRef = React.useRef<number | null>(null);
  const operationIdRef = React.useRef(0);
  const listeningRef = React.useRef(false);
  const closeRequestedRef = React.useRef(false);
  const inputTranscriptRef = React.useRef('');
  const outputTranscriptRef = React.useRef('');
  const statusRef = React.useRef<GeminiLiveVoiceStatus>('idle');

  React.useEffect(() => {
    statusRef.current = status;
    setDiagnostics((current) => ({ ...current, stage: status }));
  }, [status]);

  React.useEffect(() => {
    inputTranscriptRef.current = inputTranscript;
  }, [inputTranscript]);

  React.useEffect(() => {
    outputTranscriptRef.current = outputTranscript;
  }, [outputTranscript]);

  const setInputTranscriptAndRef = React.useCallback<React.Dispatch<React.SetStateAction<string>>>((value) => {
    setInputTranscript((current) => {
      const next = typeof value === 'function' ? value(current) : value;
      inputTranscriptRef.current = next;
      return next;
    });
  }, []);

  const clearResponseTimer = React.useCallback(() => {
    if (responseTimerRef.current !== null) {
      window.clearTimeout(responseTimerRef.current);
      responseTimerRef.current = null;
    }
  }, []);

  const stopDurationTimer = React.useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const updateDiagnostics = React.useCallback((updates: Partial<LiveDiagnostics>) => {
    setDiagnostics((current) => ({ ...current, ...updates }));
  }, []);

  const deliverConversation = React.useCallback(() => {
    const input = inputTranscriptRef.current.trim();
    const output = outputTranscriptRef.current.trim();
    if (!input && !output) {
      return;
    }

    onConversationReady?.({
      inputTranscript: input,
      outputTranscript: output,
      missionText: [
        input,
        output ? `Gemini planner notes: ${output}` : ''
      ].filter(Boolean).join('\n\n')
    });
  }, [onConversationReady]);

  const stopPlayback = React.useCallback(() => {
    playingSourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        // The source may already have ended.
      }
    });
    playingSourcesRef.current.clear();
    if (outputAudioContextRef.current) {
      playbackTimeRef.current = outputAudioContextRef.current.currentTime;
    }
  }, []);

  const ensureOutputAudio = React.useCallback(async (): Promise<AudioContext> => {
    const AudioContextClass = getAudioContextClass();
    if (!AudioContextClass) {
      throw new Error('Audio playback is not available in this Electron runtime.');
    }

    if (!outputAudioContextRef.current) {
      outputAudioContextRef.current = new AudioContextClass();
      playbackTimeRef.current = outputAudioContextRef.current.currentTime;
    }

    if (outputAudioContextRef.current.state === 'suspended') {
      await outputAudioContextRef.current.resume();
    }

    return outputAudioContextRef.current;
  }, []);

  const playPcmAudio = React.useCallback(async (base64Audio: string, mimeType?: string) => {
    const outputContext = await ensureOutputAudio();
    const bytes = base64ToBytes(base64Audio);
    const samples = pcm16BytesToFloat32(bytes);
    const sampleRate = parseAudioRate(mimeType);
    const buffer = outputContext.createBuffer(1, samples.length, sampleRate);
    const audioSamples = new Float32Array(samples.length);
    audioSamples.set(samples);
    buffer.copyToChannel(audioSamples, 0);

    const source = outputContext.createBufferSource();
    source.buffer = buffer;
    source.connect(outputContext.destination);
    source.onended = () => {
      playingSourcesRef.current.delete(source);
    };
    const startAt = Math.max(outputContext.currentTime + 0.02, playbackTimeRef.current);
    source.start(startAt);
    playbackTimeRef.current = startAt + buffer.duration;
    playingSourcesRef.current.add(source);
  }, [ensureOutputAudio]);

  const stopAudioCapture = React.useCallback(() => {
    listeningRef.current = false;
    stopDurationTimer();

    if (workletNodeRef.current) {
      workletNodeRef.current.port.onmessage = null;
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }

    if (inputSourceRef.current) {
      inputSourceRef.current.disconnect();
      inputSourceRef.current = null;
    }

    if (silentGainRef.current) {
      silentGainRef.current.disconnect();
      silentGainRef.current = null;
    }

    if (inputStreamRef.current) {
      inputStreamRef.current.getTracks().forEach((track) => track.stop());
      inputStreamRef.current = null;
    }

    if (inputAudioContextRef.current) {
      void inputAudioContextRef.current.close().catch(() => undefined);
      inputAudioContextRef.current = null;
    }

    setAudioLevel(0);
  }, [stopDurationTimer]);

  const startResponseTimer = React.useCallback((operationId: number) => {
    clearResponseTimer();
    responseTimerRef.current = window.setTimeout(() => {
      if (operationIdRef.current !== operationId || statusRef.current !== 'responding') {
        return;
      }
      setError('Gemini Live took too long to respond. The session is still open; try another short turn.');
      setStatus('live');
    }, RESPONSE_TIMEOUT_MS);
  }, [clearResponseTimer]);

  const handleToolCalls = React.useCallback((message: LiveServerMessage) => {
    const functionCalls = message.toolCall?.functionCalls || [];
    if (functionCalls.length === 0) {
      return;
    }

    const nextProposals = functionCalls
      .map(normalizeGeminiLiveProposal)
      .filter((proposal): proposal is GeminiLiveProposal => Boolean(proposal));

    if (nextProposals.length === 0) {
      return;
    }

    setProposals((current) => [...nextProposals, ...current].slice(0, 8));
    updateDiagnostics({ lastToolProposal: nextProposals[0].title });
    nextProposals.forEach((proposal) => onProposal?.(proposal));

    const functionResponses = nextProposals.map((proposal) => ({
      id: proposal.callId || proposal.id,
      name: proposal.type,
      response: {
        status: 'pending_human_approval',
        proposalId: proposal.id,
        message: 'Recorded as a pending UI proposal. Nothing has been executed.'
      }
    }));

    try {
      sessionRef.current?.sendToolResponse({ functionResponses });
      nextProposals.forEach((proposal) => onToolResponse?.(proposal));
    } catch (toolError) {
      setError(toolError instanceof Error ? toolError.message : 'Failed to acknowledge Gemini tool proposal.');
    }
  }, [onProposal, onToolResponse, updateDiagnostics]);

  const handleLiveMessage = React.useCallback((message: LiveServerMessage) => {
    handleToolCalls(message);

    const content = message.serverContent;
    if (!content) {
      return;
    }

    if (content.interrupted) {
      stopPlayback();
      setStatus(listeningRef.current ? 'listening' : 'live');
    }

    if (content.inputTranscription?.text) {
      setInputTranscriptAndRef((current) => appendTranscript(current, content.inputTranscription?.text));
    }

    if (content.outputTranscription?.text) {
      const text = content.outputTranscription.text;
      setOutputTranscript((current) => {
        const next = appendTranscript(current, text);
        outputTranscriptRef.current = next;
        return next;
      });
    }

    const parts = content.modelTurn?.parts || [];
    parts.forEach((part) => {
      const livePart = part as { inlineData?: { data?: string; mimeType?: string }; text?: string };
      if (livePart.text) {
        setOutputTranscript((current) => {
          const next = appendTranscript(current, livePart.text);
          outputTranscriptRef.current = next;
          return next;
        });
      }
      if (livePart.inlineData?.data) {
        setDiagnostics((current) => ({ ...current, receivedAudioChunks: current.receivedAudioChunks + 1 }));
        void playPcmAudio(livePart.inlineData.data, livePart.inlineData.mimeType).catch((audioError) => {
          setError(audioError instanceof Error ? audioError.message : 'Failed to play Gemini audio.');
        });
      }
    });

    if (content.modelTurn || content.outputTranscription?.text) {
      setStatus('responding');
    }

    if (content.turnComplete || content.generationComplete || content.waitingForInput) {
      clearResponseTimer();
      setStatus('live');
      if (autoDraftOnTurnComplete) {
        window.setTimeout(deliverConversation, 50);
      }
    }
  }, [
    autoDraftOnTurnComplete,
    clearResponseTimer,
    deliverConversation,
    handleToolCalls,
    playPcmAudio,
    setInputTranscriptAndRef,
    stopPlayback,
    updateDiagnostics
  ]);

  const connectSession = React.useCallback(async (): Promise<Session> => {
    if (sessionRef.current) {
      return sessionRef.current;
    }

    if (!window.electronAPI?.voice?.createLiveToken) {
      throw new Error('Gemini Live token bridge is not available in this build.');
    }

    setError('');
    setStatus('token');
    closeRequestedRef.current = false;
    let lastError: unknown = null;
    let fallbackModel = '';

    for (let attempt = 0; attempt < MAX_CONNECT_ATTEMPTS; attempt += 1) {
      const requestedModel = attempt === 0 ? undefined : fallbackModel;
      try {
        const token = await window.electronAPI.voice.createLiveToken(requestedModel ? { model: requestedModel } : undefined);
        fallbackModel = token.fallbackModel;
        updateDiagnostics({
          model: token.model,
          fallbackModel: token.fallbackModel,
          fallbackUsed: attempt > 0,
          closeCode: null,
          closeReason: ''
        });
        setStatus('connecting');

        const ai = new GoogleGenAI({
          apiKey: token.token,
          httpOptions: { apiVersion: 'v1alpha' }
        });

        const session = await ai.live.connect({
          model: token.model,
          callbacks: {
            onopen: () => {
              setStatus('live');
            },
            onmessage: handleLiveMessage,
            onerror: (event) => {
              const message = event instanceof ErrorEvent && event.message ? event.message : 'Gemini Live socket error.';
              setError(message);
            },
            onclose: (event) => {
              updateDiagnostics({ closeCode: event.code, closeReason: event.reason || '' });
              sessionRef.current = null;
              stopAudioCapture();
              clearResponseTimer();
              if (!closeRequestedRef.current) {
                setStatus('error');
                setError(event.reason || `Gemini Live closed (${event.code}).`);
              }
            }
          },
          config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            realtimeInputConfig: {
              automaticActivityDetection: { disabled: true }
            },
            systemInstruction: buildGeminiOrchestratorSystemContext(orchestratorContext),
            tools: createGeminiOrchestratorTools()
          }
        });

        sessionRef.current = session;
        setStatus('live');
        return session;
      } catch (connectError) {
        lastError = connectError;
        sessionRef.current = null;
      }
    }

    const message = lastError instanceof Error ? lastError.message : 'Gemini Live failed to connect.';
    throw new Error(message.includes('Gemini Live is not configured') || message.includes('Gemini API key')
      ? 'Gemini Live is not configured. Add GEMINI_API_KEY, GOOGLE_API_KEY, or save a Gemini key in Settings.'
      : message);
  }, [clearResponseTimer, handleLiveMessage, orchestratorContext, stopAudioCapture, updateDiagnostics]);

  const sendAudioSamples = React.useCallback((message: WorkletAudioMessage) => {
    const session = sessionRef.current;
    if (!session || !listeningRef.current) {
      return;
    }

    const resampled = resampleFloat32(message.samples, message.sampleRate, INPUT_AUDIO_RATE);
    const pcmBytes = float32ToPcm16Bytes(resampled);
    const data = bytesToBase64(pcmBytes);
    session.sendRealtimeInput({
      audio: {
        data,
        mimeType: `audio/pcm;rate=${INPUT_AUDIO_RATE}`
      }
    });
    setAudioLevel(calculateAudioLevel(message.samples));
    setDiagnostics((current) => ({ ...current, sentAudioChunks: current.sentAudioChunks + 1 }));
  }, []);

  const startAudioCapture = React.useCallback(async () => {
    const AudioContextClass = getAudioContextClass();
    if (!AudioContextClass) {
      throw new Error('Microphone audio capture is not available in this Electron runtime.');
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone access is not available in this runtime.');
    }

    const stream = await Promise.race([
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }),
      new Promise<MediaStream>((_resolve, reject) => {
        window.setTimeout(() => reject(new Error('Microphone permission timed out.')), MIC_PERMISSION_TIMEOUT_MS);
      })
    ]);

    updateDiagnostics({ micPermission: 'granted' });
    inputStreamRef.current = stream;
    const inputContext = new AudioContextClass();
    inputAudioContextRef.current = inputContext;
    if (inputContext.state === 'suspended') {
      await inputContext.resume();
    }

    const workletUrl = URL.createObjectURL(new Blob([LIVE_AUDIO_WORKLET_SOURCE], { type: 'text/javascript' }));
    try {
      await inputContext.audioWorklet.addModule(workletUrl);
    } finally {
      URL.revokeObjectURL(workletUrl);
    }

    const source = inputContext.createMediaStreamSource(stream);
    const workletNode = new AudioWorkletNode(inputContext, 'gemini-live-pcm-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1]
    });
    const silentGain = inputContext.createGain();
    silentGain.gain.value = 0;

    workletNode.port.onmessage = (event: MessageEvent<WorkletAudioMessage>) => {
      sendAudioSamples(event.data);
    };
    source.connect(workletNode);
    workletNode.connect(silentGain);
    silentGain.connect(inputContext.destination);

    inputSourceRef.current = source;
    workletNodeRef.current = workletNode;
    silentGainRef.current = silentGain;
  }, [sendAudioSamples, updateDiagnostics]);

  const start = React.useCallback(async () => {
    if (statusRef.current === 'token' || statusRef.current === 'connecting' || statusRef.current === 'listening' || statusRef.current === 'responding') {
      return;
    }

    const operationId = operationIdRef.current + 1;
    operationIdRef.current = operationId;
    setError('');
    setDurationSeconds(0);
    stopPlayback();

    try {
      await ensureOutputAudio();
      const session = await connectSession();
      if (operationIdRef.current !== operationId) {
        return;
      }

      await startAudioCapture();
      if (operationIdRef.current !== operationId) {
        stopAudioCapture();
        return;
      }

      session.sendRealtimeInput({ activityStart: {} });
      listeningRef.current = true;
      setStatus('listening');
      timerRef.current = window.setInterval(() => {
        setDurationSeconds((current) => current + 1);
      }, 1000);
    } catch (startError) {
      stopAudioCapture();
      const message = startError instanceof Error ? startError.message : 'Gemini Live failed to start.';
      updateDiagnostics({ micPermission: message.includes('Microphone') ? 'denied' : diagnostics.micPermission });
      setError(message);
      setStatus(message.includes('Gemini Live is not configured') ? 'missing-key' : 'error');
    }
  }, [
    connectSession,
    diagnostics.micPermission,
    ensureOutputAudio,
    startAudioCapture,
    stopAudioCapture,
    stopPlayback,
    updateDiagnostics
  ]);

  const stop = React.useCallback(() => {
    if (statusRef.current === 'token' || statusRef.current === 'connecting') {
      operationIdRef.current += 1;
      stopAudioCapture();
      setStatus(sessionRef.current ? 'live' : 'idle');
      return;
    }

    if (statusRef.current === 'responding') {
      stopPlayback();
      setStatus('live');
      return;
    }

    if (statusRef.current !== 'listening') {
      return;
    }

    const session = sessionRef.current;
    listeningRef.current = false;
    stopAudioCapture();
    setStatus('responding');
    try {
      session?.sendRealtimeInput({ activityEnd: {} });
      startResponseTimer(operationIdRef.current);
    } catch (stopError) {
      setError(stopError instanceof Error ? stopError.message : 'Failed to end Gemini Live turn.');
      setStatus('error');
    }
  }, [startResponseTimer, stopAudioCapture, stopPlayback]);

  const endSession = React.useCallback(() => {
    operationIdRef.current += 1;
    closeRequestedRef.current = true;
    clearResponseTimer();
    stopDurationTimer();
    stopAudioCapture();
    stopPlayback();
    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch {
        // The socket may already be closed.
      }
      sessionRef.current = null;
    }
    setAudioLevel(0);
    setStatus('idle');
  }, [clearResponseTimer, stopAudioCapture, stopDurationTimer, stopPlayback]);

  const reset = React.useCallback(() => {
    endSession();
    setInputTranscript('');
    setOutputTranscript('');
    inputTranscriptRef.current = '';
    outputTranscriptRef.current = '';
    setError('');
    setDurationSeconds(0);
  }, [endSession]);

  const approveProposal = React.useCallback((proposalId: string) => {
    setProposals((current) => current.map((proposal) => (
      proposal.id === proposalId ? { ...proposal, status: 'approved' } : proposal
    )));
  }, []);

  const dismissProposal = React.useCallback((proposalId: string) => {
    setProposals((current) => current.map((proposal) => (
      proposal.id === proposalId ? { ...proposal, status: 'dismissed' } : proposal
    )));
  }, []);

  React.useEffect(() => () => {
    endSession();
    if (outputAudioContextRef.current) {
      void outputAudioContextRef.current.close().catch(() => undefined);
      outputAudioContextRef.current = null;
    }
  }, [endSession]);

  return {
    status,
    transcript: inputTranscript,
    inputTranscript,
    setTranscript: setInputTranscriptAndRef,
    outputTranscript,
    error,
    durationSeconds,
    audioLevel,
    proposals,
    diagnostics,
    start,
    stop,
    reset,
    cancel: reset,
    endSession,
    approveProposal,
    dismissProposal
  };
}
