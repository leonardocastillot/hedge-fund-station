import React from 'react';

export type VoiceStatus = 'idle' | 'recording' | 'transcribing' | 'ready' | 'error';

interface UseVoiceRecorderOptions {
  autoClearOnSuccess?: boolean;
  onTranscript?: (text: string) => void;
}

export function useVoiceRecorder(options: UseVoiceRecorderOptions = {}) {
  const { autoClearOnSuccess = false, onTranscript } = options;
  const [status, setStatus] = React.useState<VoiceStatus>('idle');
  const [transcript, setTranscript] = React.useState('');
  const [error, setError] = React.useState('');
  const [durationSeconds, setDurationSeconds] = React.useState(0);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const mediaStreamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const timerRef = React.useRef<number | null>(null);

  const stopTimer = React.useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cleanupMedia = React.useCallback(() => {
    stopTimer();

    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.onerror = null;
      mediaRecorderRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, [stopTimer]);

  React.useEffect(() => () => cleanupMedia(), [cleanupMedia]);

  const reset = React.useCallback(() => {
    setTranscript('');
    setError('');
    setDurationSeconds(0);
    setStatus('idle');
  }, []);

  const transcribeBlob = React.useCallback(async (audioBlob: Blob) => {
    setStatus('transcribing');
    setError('');

    try {
      const audio = await audioBlob.arrayBuffer();
      const result = await window.electronAPI.voice.transcribe(audio, audioBlob.type || 'audio/webm');
      const nextTranscript = result.text.trim();
      setTranscript(nextTranscript);

      if (!nextTranscript) {
        setError('The transcript came back empty.');
        setStatus('error');
        return;
      }

      onTranscript?.(nextTranscript);
      if (autoClearOnSuccess) {
        setDurationSeconds(0);
        setStatus('idle');
        return;
      }

      setStatus('ready');
    } catch (voiceError) {
      const message = voiceError instanceof Error ? voiceError.message : 'Voice transcription failed.';
      setError(message);
      setStatus('error');
    }
  }, [autoClearOnSuccess, onTranscript]);

  const startRecording = React.useCallback(async () => {
    if (status === 'recording' || status === 'transcribing') {
      return;
    }

    setError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });

      chunksRef.current = [];
      setTranscript('');
      setDurationSeconds(0);
      setStatus('recording');
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      timerRef.current = window.setInterval(() => {
        setDurationSeconds((current) => current + 1);
      }, 1000);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        cleanupMedia();
        setError('The recorder failed while capturing audio.');
        setStatus('error');
      };

      recorder.onstop = () => {
        const chunkMimeType = recorder.mimeType || mimeType;
        const audioBlob = new Blob(chunksRef.current, { type: chunkMimeType });
        chunksRef.current = [];
        cleanupMedia();

        if (audioBlob.size === 0) {
          setError('No audio was captured.');
          setStatus('error');
          return;
        }

        void transcribeBlob(audioBlob);
      };

      recorder.start();
    } catch (mediaError) {
      cleanupMedia();
      const message = mediaError instanceof Error ? mediaError.message : 'Microphone access failed.';
      setError(message);
      setStatus('error');
    }
  }, [cleanupMedia, status, transcribeBlob]);

  const stopRecording = React.useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'recording') {
      return;
    }

    recorder.stop();
  }, []);

  return {
    status,
    transcript,
    setTranscript,
    error,
    durationSeconds,
    startRecording,
    stopRecording,
    reset
  };
}
