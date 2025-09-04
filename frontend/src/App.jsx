import React, { useState, useEffect, useRef, useCallback } from 'react';
import './index.css';

// --- Icon Components (unchanged) ---
const MicIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zM17.3 11c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"></path></svg>);
const SunIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zm-9-7c.55 0 1-.45 1-1V3c0-.55-.45-1-1-1s-1 .45-1 1v2c0 .55.45 1 1 1zm0 14c.55 0 1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1v2c0 .55.45 1 1 1zm-6.36-2.64c.39.39 1.02.39 1.41 0l1.41-1.41c.39-.39.39-1.02 0-1.41-.39-.39-1.02-.39-1.41 0l-1.41 1.41c-.39.39-.39 1.02 0 1.41zm10.61 0c.39.39 1.02.39 1.41 0l1.41-1.41c.39-.39.39-1.02 0-1.41-.39-.39-1.02-.39-1.41 0l-1.41 1.41c-.39.39-.39 1.02 0 1.41zM4.93 4.93c.39.39 1.02.39 1.41 0l1.41-1.41c.39-.39.39-1.02 0-1.41-.39-.39-1.02-.39-1.41 0L4.93 3.51c-.39.39-.39 1.02 0 1.42z" /></svg>);
const MoonIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M11.1 12.08c-2.33-4.51-.5-8.48.5-10.08-1.74.18-3.24.83-4.5 1.95-1.95 1.77-2.6 4.34-1.99 6.77.62 2.45 2.54 4.36 4.99 4.99 2.45.62 5 .04 6.77-1.95-1.26 1.25-2.76 1.9-4.5 1.95-.9-.18-1.76-.55-2.42-1.08z" /></svg>);

const SILENCE_DURATION_MS = 1200;
const SILENCE_THRESHOLD = 0.01;
const INTERRUPTION_THRESHOLD = 0.25;

function App() {
    const [theme, setTheme] = useState('dark');
    const [appState, setAppState] = useState('idle');
    const [history, setHistory] = useState([]);
    const [isWrittenMode, setIsWrittenMode] = useState(false);
    const [isVerbalMode, setIsVerbalMode] = useState(true);
    const [responseText, setResponseText] = useState('');

    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const microphoneStreamRef = useRef(null);
    const audioContextRef = useRef(null);
    const animationFrameIdRef = useRef(null);
    const utteranceQueueRef = useRef([]);
    const appStateRef = useRef(appState);

    // Create a ref to hold the startRecording function to break the circular dependency
    const startRecordingRef = useRef(null);

    useEffect(() => {
        appStateRef.current = appState;
    }, [appState]);

    useEffect(() => {
        document.body.className = `theme-${theme}`;
    }, [theme]);

    const endConversation = useCallback(() => {
        if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') mediaRecorderRef.current.stop();
        window.speechSynthesis.cancel();
        utteranceQueueRef.current = [];
        if (microphoneStreamRef.current) {
            microphoneStreamRef.current.getTracks().forEach(track => track.stop());
            microphoneStreamRef.current = null;
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch(console.error);
            audioContextRef.current = null;
        }
        setAppState('idle');
    }, []);

    const speakFromQueue = useCallback(() => {
        if (utteranceQueueRef.current.length > 0 && !window.speechSynthesis.speaking) {
            const utterance = utteranceQueueRef.current[0];
            utterance.onend = () => {
                utteranceQueueRef.current.shift();
                if (utteranceQueueRef.current.length === 0) {
                    // When speaking is done, restart listening
                    if (microphoneStreamRef.current && startRecordingRef.current) {
                        startRecordingRef.current(microphoneStreamRef.current);
                    }
                } else {
                    speakFromQueue();
                }
            };
            window.speechSynthesis.speak(utterance);
        }
    }, []); // This function no longer directly depends on `startRecording`

    const sendAudioToServer = useCallback(async (audio) => {
        try {

            const apiUrl = `${import.meta.env.VITE_API_URL || ''}/api/dialog`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ audio, history })
            });

            // const response = await fetch('/api/dialog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio, history }) });
           
            if (!response.ok) throw new Error(`Server error: ${response.statusText}`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullResponse = '';
            let firstChunk = true;

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                for (const line of chunk.split('\n\n')) {
                    if (line.startsWith('data:')) {
                        const data = JSON.parse(line.substring(5));
                        if (data.text) {
                            if (firstChunk) { setAppState('speaking'); firstChunk = false; }
                            fullResponse += data.text;
                            if (isWrittenMode) setResponseText(prev => prev + data.text);
                            if (isVerbalMode) {
                                utteranceQueueRef.current.push(new SpeechSynthesisUtterance(data.text));
                                speakFromQueue();
                            }
                        }
                    }
                }
            }

            // Only restart recording here if not in verbal mode (verbal mode restarts in speakFromQueue)
            if (!isVerbalMode) {
                if (fullResponse && microphoneStreamRef.current && startRecordingRef.current) {
                    startRecordingRef.current(microphoneStreamRef.current);
                } else if (microphoneStreamRef.current && startRecordingRef.current) {
                    // Case for no response
                    startRecordingRef.current(microphoneStreamRef.current);
                }
            }

            if (fullResponse) {
                setHistory(prev => [...prev, { role: 'user', parts: [{ text: "user audio" }] }, { role: 'model', parts: [{ text: fullResponse }] }]);
            }

        } catch (error) {
            console.error("Error sending audio to server:", error);
            endConversation();
        }
    }, [history, isVerbalMode, isWrittenMode, speakFromQueue, endConversation]);

    const processAudio = useCallback(() => {
        if (audioChunksRef.current.length === 0) {
            if (microphoneStreamRef.current && startRecordingRef.current) {
                startRecordingRef.current(microphoneStreamRef.current);
            }
            return;
        }
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => sendAudioToServer(reader.result.split(',')[1]);
        reader.readAsDataURL(audioBlob);
    }, [sendAudioToServer]);

    const startRecording = useCallback((stream) => {
        setAppState('listening');
        audioChunksRef.current = [];
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };
        mediaRecorder.onstop = processAudio;
        mediaRecorder.start();
    }, [processAudio]);

    // This useEffect hook keeps the ref updated with the latest version of startRecording.
    useEffect(() => {
        startRecordingRef.current = startRecording;
    });

    const setupVAD = useCallback((stream) => {
        if (audioContextRef.current) audioContextRef.current.close().catch(console.error);
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioContextRef.current = audioContext;
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        let silenceTimer = null;

        const monitor = () => {
            animationFrameIdRef.current = requestAnimationFrame(monitor);
            if (!microphoneStreamRef.current) {
                cancelAnimationFrame(animationFrameIdRef.current);
                return;
            }
            analyser.getByteTimeDomainData(dataArray);
            const average = dataArray.reduce((sum, val) => sum + Math.abs(val - 128), 0) / bufferLength / 128;
            const currentAppState = appStateRef.current;

            if (currentAppState === 'listening') {
                if (average < SILENCE_THRESHOLD) {
                    if (!silenceTimer) {
                        silenceTimer = setTimeout(() => {
                            if (mediaRecorderRef.current?.state === 'recording') {
                                mediaRecorderRef.current.stop();
                                setAppState('processing');
                            }
                        }, SILENCE_DURATION_MS);
                    }
                } else {
                    clearTimeout(silenceTimer);
                    silenceTimer = null;
                }
            } else if (currentAppState === 'speaking') {
                if (average > INTERRUPTION_THRESHOLD) {
                    console.log("Barge-in detected!");
                    window.speechSynthesis.cancel();
                    utteranceQueueRef.current = [];
                    if (microphoneStreamRef.current) {
                        startRecording(microphoneStreamRef.current);
                    }
                }
            }
        };
        monitor();
    }, [startRecording]);

    const startConversation = useCallback(async () => {
        if (!isWrittenMode && !isVerbalMode) {
            alert("Please select at least one output mode.");
            return;
        }
        setResponseText('');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            microphoneStreamRef.current = stream;
            startRecording(stream);
            setupVAD(stream);
        } catch (error) {
            console.error('Could not get microphone stream:', error);
        }
    }, [isWrittenMode, isVerbalMode, startRecording, setupVAD]);

    const handleOrbClick = useCallback(() => {
        if (appStateRef.current !== 'idle') {
            endConversation();
        } else {
            startConversation();
        }
    }, [startConversation, endConversation]);

    const statusMap = { idle: 'Click the orb to start the conversation.', listening: 'Listening...', processing: 'Thinking...', speaking: 'Speaking...' };

    return (
        <>
            <div className="theme-toggle" onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}>
                {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </div>
            <div className="voice-container">
                <h1 className="title">Valora Voice Assistant</h1>
                <div className="orb-container">
                    <div id="voice-orb" className={`voice-orb ${appState}`} onClick={handleOrbClick}> <MicIcon /> </div>
                </div>
                <p className="status-text">{statusMap[appState]}</p>
                <div className="output-controls">
                    <button className={`control-button ${isWrittenMode ? 'active' : ''}`} onClick={() => setIsWrittenMode(prev => !prev)} disabled={appState !== 'idle'}> Written </button>
                    <button className={`control-button ${isVerbalMode ? 'active' : ''}`} onClick={() => setIsVerbalMode(prev => !prev)} disabled={appState !== 'idle'}> Verbal </button>
                </div>
                {isWrittenMode && responseText && (
                    <div className="response-container">
                        {responseText}
                    </div>
                )}
                <div className="footer"> Made by Indresh </div>
            </div>
        </>
    );
}

export default App;