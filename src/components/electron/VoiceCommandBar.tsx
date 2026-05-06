import React from 'react';
import { useGeminiLiveVoice } from '../../hooks/useGeminiLiveVoice';

interface VoiceCommandBarProps {
  activeTerminalId: string | null;
}

export const VoiceCommandBar: React.FC<VoiceCommandBarProps> = ({ activeTerminalId }) => {
  const [autoSend, setAutoSend] = React.useState(false);
  const [lastSentText, setLastSentText] = React.useState('');
  const shortcutRecordingRef = React.useRef(false);
  const resetVoiceRef = React.useRef<() => void>(() => undefined);

  const sendTranscriptToTerminal = React.useCallback((text: string) => {
    const trimmed = text.trim();
    if (!activeTerminalId || !trimmed) {
      return false;
    }

    window.electronAPI.terminal.write(activeTerminalId, `${trimmed}\r`);
    setLastSentText(trimmed);
    resetVoiceRef.current();
    return true;
  }, [activeTerminalId]);

  const {
    status,
    transcript,
    setTranscript,
    error,
    durationSeconds,
    start: startRecording,
    stop: stopRecording,
    reset
  } = useGeminiLiveVoice({
    onConversationReady: (conversation) => {
      if (autoSend) {
        sendTranscriptToTerminal(conversation.inputTranscript);
      }
    }
  });
  resetVoiceRef.current = reset;

  const handleSendToTerminal = React.useCallback(() => {
    sendTranscriptToTerminal(transcript);
  }, [sendTranscriptToTerminal, transcript]);

  React.useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      const tagName = target.tagName.toLowerCase();
      return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isEditableTarget(event.target)) {
        return;
      }

      if (
        event.altKey
        && event.key.toLowerCase() === 'm'
        && !shortcutRecordingRef.current
        && status !== 'token'
        && status !== 'connecting'
        && status !== 'listening'
        && status !== 'responding'
      ) {
        event.preventDefault();
        shortcutRecordingRef.current = true;
        void startRecording();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'm' && shortcutRecordingRef.current) {
        event.preventDefault();
        shortcutRecordingRef.current = false;
        stopRecording();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [startRecording, status, stopRecording]);

  const statusLabel = (() => {
    switch (status) {
      case 'listening':
        return `Dictating ${durationSeconds}s`;
      case 'token':
        return 'Initializing dictation channel...';
      case 'connecting':
        return 'Connecting assistant...';
      case 'responding':
        return 'Assistant preparing output...';
      case 'missing-key':
        return 'Dictation key missing';
      case 'live':
        return 'Dictation live';
      case 'ready':
        return autoSend ? 'Ready (auto-send)' : 'Ready for dictation';
      case 'error':
        return 'Terminal input error';
      case 'idle':
      default:
        return activeTerminalId ? 'Ready to send text' : 'Select a terminal';
    }
  })();

  const handleVoiceClick = React.useCallback(() => {
    if (status === 'listening') {
      stopRecording();
      return;
    }
    if (status === 'token' || status === 'connecting' || status === 'responding') {
      return;
    }
    void startRecording();
  }, [startRecording, status, stopRecording]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'stretch',
      gap: '8px',
      flex: 1,
      minWidth: 0
    }}>
      <button
        onClick={handleVoiceClick}
        disabled={status === 'token' || status === 'connecting' || status === 'responding'}
        style={{
          padding: '4px 10px',
          minWidth: '88px',
          background: status === 'listening'
            ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
            : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
          color: '#fff',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '6px',
          cursor: status === 'token' || status === 'connecting' || status === 'responding' ? 'not-allowed' : 'pointer',
          fontSize: '10px',
          fontWeight: '700',
          opacity: status === 'token' || status === 'connecting' || status === 'responding' ? 0.6 : 1,
          boxShadow: status === 'listening'
            ? '0 2px 10px rgba(239, 68, 68, 0.35)'
            : '0 2px 10px rgba(37, 99, 235, 0.3)'
        }}
      title="Dictate text and send to terminal. Shortcut: hold Alt+M for one turn."
      >
              {status === 'listening' ? 'Stop Dictation' : status === 'live' ? 'Send' : 'Start Dictation'}
      </button>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        flex: 1,
        minWidth: 0
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          minHeight: '18px'
        }}>
          <span style={{
            fontSize: '10px',
            color: status === 'error' ? '#fca5a5' : '#93c5fd',
            fontWeight: '600',
            whiteSpace: 'nowrap'
          }}>
            {statusLabel}
          </span>
          <span style={{
            fontSize: '10px',
            color: '#64748b',
            whiteSpace: 'nowrap'
          }}>
            Alt+M
          </span>
          {error && (
            <span style={{
              fontSize: '10px',
              color: '#fca5a5',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {error}
            </span>
          )}
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: '8px',
          minWidth: 0
        }}>
          <textarea
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            placeholder="Type or dictate, review here, then send to active terminal."
            rows={2}
            style={{
              flex: 1,
              minWidth: 0,
              resize: 'none',
              background: 'rgba(0, 0, 0, 0.45)',
              color: '#e5e7eb',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              borderRadius: '6px',
              padding: '6px 8px',
              fontSize: '11px',
              lineHeight: 1.35,
              outline: 'none'
            }}
          />

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '10px',
              color: '#cbd5e1',
              cursor: 'pointer',
              userSelect: 'none'
            }}>
              <input
                type="checkbox"
                checked={autoSend}
                onChange={(event) => setAutoSend(event.target.checked)}
              />
              Auto-send to terminal
            </label>
            <button
              onClick={handleSendToTerminal}
              disabled={!activeTerminalId || !transcript.trim() || status === 'token' || status === 'connecting' || status === 'listening' || status === 'responding'}
              style={{
                padding: '4px 10px',
                background: !activeTerminalId || !transcript.trim() || status === 'token' || status === 'connecting' || status === 'listening' || status === 'responding'
                  ? 'rgba(75, 85, 99, 0.4)'
                  : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: !activeTerminalId || !transcript.trim() || status === 'token' || status === 'connecting' || status === 'listening' || status === 'responding' ? '#9ca3af' : '#fff',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '6px',
                cursor: !activeTerminalId || !transcript.trim() || status === 'token' || status === 'connecting' || status === 'listening' || status === 'responding' ? 'not-allowed' : 'pointer',
                fontSize: '10px',
                fontWeight: '700'
              }}
            >
              Send
            </button>
            <button
              onClick={reset}
              style={{
                padding: '4px 10px',
                background: 'rgba(15, 23, 42, 0.8)',
                color: '#cbd5e1',
                border: '1px solid rgba(148, 163, 184, 0.18)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '10px',
                fontWeight: '700',
                opacity: 1
              }}
            >
              Clear
            </button>
          </div>
        </div>

        {lastSentText && (
          <div style={{
            fontSize: '10px',
            color: '#94a3b8',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            Sent: {lastSentText}
          </div>
        )}
      </div>
    </div>
  );
};
