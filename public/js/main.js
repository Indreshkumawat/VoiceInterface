// public/js/main.js
const controlButton = document.getElementById('control-button');
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

// --- FIX 1: TUNE THE THRESHOLDS ---
const SILENCE_DURATION_MS = 2000; // Increased to 2 seconds for more forgiving pauses.
const SILENCE_THRESHOLD = 0.01;
// This is the most important value to tune. We've made it much higher to prevent self-interruption.
const INTERRUPTION_THRESHOLD = 0.25; 

// --- FIX 2: ADD A DELAY BEFORE ACTIVATING BARGE-IN ---
const BARGE_IN_ACTIVATION_DELAY_MS = 300; // Wait 300ms before listening for interruptions.


controlButton.addEventListener('click', handleControlButtonClick);

function handleControlButtonClick() {
    if (isAiSpeaking) {
        interruptSpeech(); 
    } else if (isRecording) {
        stopRecording(); 
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
            statusDiv.textContent = 'Listening...';
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

function stopVAD() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (microphoneStream) microphoneStream.getTracks().forEach(track => track.stop());
    if (audioContext && audioContext.state !== 'closed') audioContext.close();
    animationFrameId = null;
    microphoneStream = null;
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
        setupVAD(stream);
    } catch (error) {
        console.error('Error starting recording:', error);
        updateButtonState('idle');
        isRecording = false;
    }
}

function stopRecording() {
    if (!isRecording) return;
    isRecording = false;
    
    stopVAD();

    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
    
    updateButtonState('processing');
}

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
        if (!isRecording && !isAiSpeaking) {
            stopVAD();
            return;
        }

        analyser.getByteTimeDomainData(dataArray);
        const sum = dataArray.reduce((acc, val) => acc + Math.abs(val - 128), 0);
        const average = sum / bufferLength / 128;

        if (isRecording) {
            if (average < SILENCE_THRESHOLD) {
                if (!silenceTimer) {
                    silenceTimer = setTimeout(stopRecording, SILENCE_DURATION_MS);
                }
            } else {
                clearTimeout(silenceTimer);
                silenceTimer = null;
            }
        } else if (isAiSpeaking) {
            if (average > INTERRUPTION_THRESHOLD) {
                console.log("Barge-in detected! User started speaking.");
                interruptSpeech();
                setTimeout(startRecording, 50); 
                return;
            }
        }
        animationFrameId = requestAnimationFrame(monitorAudio);
    };
    monitorAudio();
}

async function processAudio() {
    if (audioChunks.length === 0) {
        updateButtonState('idle');
        return;
    }
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    const reader = new FileReader();
    reader.onloadend = () => sendAudioToServer(reader.result.split(',')[1]);
    reader.readAsDataURL(audioBlob);
}

function interruptSpeech() {
    if (synth.speaking) {
        utteranceQueue = [];
        synth.cancel();
    }
    isAiSpeaking = false;
    stopVAD();
    if (!isRecording) {
        updateButtonState('idle');
    }
}

async function speakText(text) {
    const utterance = new SpeechSynthesisUtterance(text);
    utteranceQueue.push(utterance);
    
    utterance.onstart = () => {
        isAiSpeaking = true;
        updateButtonState('speaking');
        // --- FIX 2 (IMPLEMENTATION): Wait before activating VAD for barge-in ---
        setTimeout(async () => {
            if(isAiSpeaking) { // Only start if AI is still supposed to be speaking
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    microphoneStream = stream;
                    setupVAD(stream);
                } catch (err) {
                    console.error("Could not start VAD for interruption:", err);
                }
            }
        }, BARGE_IN_ACTIVATION_DELAY_MS);
    };
    
    utterance.onend = () => {
        if (utteranceQueue.length === 0) {
            isAiSpeaking = false;
            stopVAD();
            if (!isRecording) updateButtonState('idle');
        }
        speakNextInQueue();
    };

    utterance.onerror = (event) => {
        console.error('SpeechSynthesisUtterance.onerror', event);
        isAiSpeaking = false;
        stopVAD();
        updateButtonState('idle');
        speakNextInQueue();
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
                      //  aiResponseDiv.textContent = fullResponse;
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
        console.error("Error sending audio to server:", error);
        statusDiv.textContent = 'Sorry, an error occurred.';
        updateButtonState('idle');
    }
}