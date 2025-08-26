// public/js/main.js
const controlButton = document.getElementById('control-button');
const statusDiv = document.getElementById('status');
const aiResponseDiv = document.getElementById('ai-response');

// --- Speech Synthesis Setup ---
const synth = window.speechSynthesis;
let utteranceQueue = [];
let isAiSpeaking = false; // Renamed for clarity

// --- Recording & State Management ---
let mediaRecorder;
let audioChunks = [];
let history = [];
let isRecording = false;

// --- Voice Activity Detection (VAD) Setup ---
let audioContext;
let analyser;
let microphoneStream;
let silenceTimer;
const SILENCE_DURATION_MS = 2000; // 2 seconds of silence to stop
const SILENCE_THRESHOLD = 0.01; // Sensitivity of silence detection
let animationFrameId;

controlButton.addEventListener('click', handleControlButtonClick);

function handleControlButtonClick() {
    if (isAiSpeaking) {
        interruptSpeech();
    } else if (isRecording) {
        stopRecording(); // Manual override
    } else {
        startRecording();
    }
}

function updateButtonState(state) {
    switch (state) {
        case 'idle':
            controlButton.textContent = 'Start Listening';
            controlButton.classList.remove('listening', 'speaking');
            controlButton.disabled = false;
            statusDiv.textContent = 'Click the button and start speaking';
            break;
        case 'listening':
            controlButton.textContent = 'Listening...';
            controlButton.classList.add('listening');
            controlButton.classList.remove('speaking');
            statusDiv.textContent = 'Listening... Speak now.';
            break;
        case 'processing':
            controlButton.textContent = 'Thinking...';
            controlButton.disabled = true;
            statusDiv.textContent = 'Processing your request...';
            break;
        case 'speaking':
            controlButton.textContent = 'Stop Speaking';
            controlButton.classList.remove('listening');
            controlButton.classList.add('speaking');
            controlButton.disabled = false;
            break;
    }
}

async function startRecording() {
    if (isRecording) return;
    isRecording = true;

    interruptSpeech();
    audioChunks = [];
    aiResponseDiv.textContent = '';
    updateButtonState('listening');

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        microphoneStream = stream;
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mediaRecorder.ondataavailable = event => {
            if (event.data.size > 0) audioChunks.push(event.data);
        };
        mediaRecorder.onstop = processAudio;
        mediaRecorder.start();

        // Start VAD
        setupVAD(stream);

    } catch (error) {
        console.error('Error accessing microphone:', error);
        statusDiv.textContent = 'Error: Could not access microphone.';
        updateButtonState('idle');
        isRecording = false;
    }
}

function stopRecording() {
    if (!isRecording) return;
    isRecording = false;

    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (silenceTimer) clearTimeout(silenceTimer);
    if (audioContext && audioContext.state !== 'closed') audioContext.close();

    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }

    if (microphoneStream) {
        microphoneStream.getTracks().forEach(track => track.stop());
    }

    updateButtonState('processing');
}

function setupVAD(stream) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const checkForSilence = () => {
        if (!isRecording) return;

        analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            sum += Math.abs(dataArray[i] - 128); // 128 is the center (silence)
        }
        const average = sum / bufferLength / 128; // Normalize to 0-1 range

        if (average < SILENCE_THRESHOLD) {
            if (!silenceTimer) {
                silenceTimer = setTimeout(stopRecording, SILENCE_DURATION_MS);
            }
        } else {
            if (silenceTimer) {
                clearTimeout(silenceTimer);
                silenceTimer = null;
            }
        }
        animationFrameId = requestAnimationFrame(checkForSilence);
    };
    checkForSilence();
}

async function processAudio() {
    if (audioChunks.length === 0) {
        updateButtonState('idle');
        return;
    }
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    const reader = new FileReader();
    reader.onloadend = () => {
        const base64Audio = reader.result.split(',')[1];
        sendAudioToServer(base64Audio);
    };
    reader.readAsDataURL(audioBlob);
}

// --- AI Response and Speech Synthesis ---

function interruptSpeech() {
    if (synth.speaking) {
        utteranceQueue = [];
        synth.cancel();
        isAiSpeaking = false;
        updateButtonState('idle');
    }
}

function speakText(text) {
    const utterance = new SpeechSynthesisUtterance(text);
    utteranceQueue.push(utterance);

    utterance.onstart = () => {
        isAiSpeaking = true;
        updateButtonState('speaking');
    };

    utterance.onend = () => {
        // Check if this was the last item in the queue
        if (utteranceQueue.length === 0) {
            isAiSpeaking = false;
            if (!isRecording) { // Don't switch to idle if user started talking again
                updateButtonState('idle');
            }
        }
        speakNextInQueue(); // Try to speak the next item
    };

    utterance.onerror = (event) => {
        console.error('SpeechSynthesisUtterance.onerror', event);
        isAiSpeaking = false;
        updateButtonState('idle');
        speakNextInQueue(); // Try the next one even if this fails
    };

    // If nothing is currently speaking, start the queue.
    if (!synth.speaking) {
        speakNextInQueue();
    }
}

function speakNextInQueue() {
    if (utteranceQueue.length > 0) {
        const utterance = utteranceQueue.shift();
        synth.speak(utterance);
    }
}

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
            const lines = chunk.split('\n\n');

            for (const line of lines) {
                if (line.startsWith('data:')) {
                    const data = JSON.parse(line.substring(5));
                    if (data.text) {
                        fullResponse += data.text;
                        aiResponseDiv.textContent = fullResponse;
                        speakText(data.text);
                    }
                }
            }
        }

        if (fullResponse) {
            history.push({ role: 'user', parts: [{ text: 'User audio input' }] });
            history.push({ role: 'model', parts: [{ text: fullResponse }] });
        } else {
             updateButtonState('idle');
        }

    } catch (error) {
        console.error("Error communicating with server:", error);
        statusDiv.textContent = 'Sorry, an error occurred.';
        updateButtonState('idle');
    }
}