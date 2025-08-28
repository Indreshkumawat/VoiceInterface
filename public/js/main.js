// public/js/main.js
const controlButton = document.getElementById('voice-orb');
const statusDiv = document.getElementById('status');
const aiResponseDiv = document.getElementById('ai-response');

// --- Speech Synthesis Setup ---
const synth = window.speechSynthesis;
let utteranceQueue = [];
let isAiSpeaking = false;

// --- Recording & State Management ---
let mediaRecorder;
let audioChunks = [];
let history = [];
let isRecording = false;

// --- Voice Activity Detection (VAD) & Barge-In Setup ---
let audioContext;
let analyser;
let microphoneStream;
let silenceTimer;
let animationFrameId;

const SILENCE_DURATION_MS = 1200;
const SILENCE_THRESHOLD = 0.01;
const INTERRUPTION_THRESHOLD = 0.25;

// --- Main Control Logic ---
controlButton.addEventListener('click', handleControlButtonClick);

function handleControlButtonClick() {
    if (isRecording || isAiSpeaking) {
        endConversation();
    } else {
        startConversation();
    }
}

// --- State and UI Management ---
function updateButtonState(state) {
    const voiceOrb = document.getElementById('voice-orb');
    const statusText = document.getElementById('status');

    // Remove all state classes first
    voiceOrb.classList.remove('listening', 'processing', 'speaking');

    switch (state) {
        case 'idle':
            statusText.textContent = 'Click the orb to start the conversation.';
            break;
        case 'listening':
            voiceOrb.classList.add('listening');
            statusText.textContent = 'Listening...';
            break;
        case 'processing':
            voiceOrb.classList.add('processing');
            statusText.textContent = 'Thinking...';
            break;
        case 'speaking':
            voiceOrb.classList.add('speaking');
            statusText.textContent = 'Speaking...';
            break;
    }
}

// --- Core Conversation Flow ---
async function startConversation() {
    try {
        microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setupVAD(microphoneStream); // Start the persistent VAD loop for the session
        startRecording();
    } catch (error) {
        console.error('Could not get microphone stream:', error);
        statusDiv.textContent = 'Error: Could not access microphone.';
    }
}

function endConversation() {
    isRecording = false;
    isAiSpeaking = false;

    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
    if (synth.speaking) {
        utteranceQueue = [];
        synth.cancel();
    }

    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (microphoneStream) {
        microphoneStream.getTracks().forEach(track => track.stop());
        microphoneStream = null;
    }
    if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
    }

    updateButtonState('idle');
}

function startRecording() {
    if (!microphoneStream || isRecording) return;
    isRecording = true;
    isAiSpeaking = false;

    audioChunks = [];
    updateButtonState('listening');

    mediaRecorder = new MediaRecorder(microphoneStream, { mimeType: 'audio/webm' });
    mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) audioChunks.push(event.data);
    };
    mediaRecorder.onstop = processAudio;
    mediaRecorder.start();
}

function stopRecordingAndProcess() {
    if (!isRecording) return;
    isRecording = false;

    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
    updateButtonState('processing');
}

// --- Voice Activity Detection (The Brains of the Operation) ---
function setupVAD(stream) {
    if (audioContext && audioContext.state !== 'closed') audioContext.close();
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const monitorAudio = () => {
        // This loop now runs continuously as long as the conversation is active
        analyser.getByteTimeDomainData(dataArray);
        const average = dataArray.reduce((sum, val) => sum + Math.abs(val - 128), 0) / bufferLength / 128;

        if (isRecording) {
            // Mode 1: Listening for user to stop talking (silence)
            if (average < SILENCE_THRESHOLD) {
                if (!silenceTimer) {
                    silenceTimer = setTimeout(stopRecordingAndProcess, SILENCE_DURATION_MS);
                }
            } else {
                clearTimeout(silenceTimer);
                silenceTimer = null;
            }
        } else if (isAiSpeaking) {
            // Mode 2: Listening for user to interrupt (sound)
            if (average > INTERRUPTION_THRESHOLD) {
                console.log("Barge-in detected!");
                interruptSpeech(true); // Interrupt and immediately start recording again
            }
        }
        animationFrameId = requestAnimationFrame(monitorAudio);
    };
    monitorAudio();
}

async function processAudio() {
    if (audioChunks.length === 0) {
        startRecording();
        return;
    }
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    const reader = new FileReader();
    reader.onloadend = () => sendAudioToServer(reader.result.split(',')[1]);
    reader.readAsDataURL(audioBlob);
}

// --- Speech and Interruption ---
function interruptSpeech(shouldStartRecordingAgain = false) {
    if (synth.speaking) {
        utteranceQueue = [];
        synth.cancel();
    }
    isAiSpeaking = false;
    
    if (shouldStartRecordingAgain) {
        startRecording();
    }
}

async function speakText(text) {
    const utterance = new SpeechSynthesisUtterance(text);
    utteranceQueue.push(utterance);
    
    utterance.onstart = () => {
        isRecording = false; // We are no longer recording user input
        isAiSpeaking = true; // We are now in speaking mode
        updateButtonState('speaking');
    };
    
    utterance.onend = () => {
        if (utteranceQueue.length === 0) {
            // After finishing speaking, seamlessly go back to listening
            startRecording();
        }
        speakNextInQueue();
    };

    utterance.onerror = (event) => {
        console.error('SpeechSynthesisUtterance.onerror', event);
        // If speech fails, go back to listening
        startRecording();
    };

    if (!synth.speaking) {
        speakNextInQueue();
    }
}

function speakNextInQueue() {
    if (utteranceQueue.length > 0 && !synth.speaking) {
        synth.speak(utteranceQueue.shift());
    }
}

// --- Server Communication ---
async function sendAudioToServer(audio) {
    try {
        const response = await fetch('/api/dialog', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio, history }),
        });
        if (!response.ok) throw new Error(`Server error: ${response.statusText}`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            for (const line of chunk.split('\n\n')) {
                if (line.startsWith('data:')) {
                    const data = JSON.parse(line.substring(5));
                    if (data.text) {
                        fullResponse += data.text;
                        speakText(data.text);
                    }
                }
            }
        }
        if (fullResponse) {
            history.push({ role: 'user', parts: [{ text: "user audio" }] });
            history.push({ role: 'model', parts: [{ text: fullResponse }] });
        } else {
             startRecording();
        }
    } catch (error) {
        console.error("Error sending audio to server:", error);
        statusDiv.textContent = 'Sorry, an error occurred.';
        endConversation();
    }
}