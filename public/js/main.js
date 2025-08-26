// public/js/main.js
const startButton = document.getElementById('start-button');
const stopButton = document.getElementById('stop-button');
const statusDiv = document.getElementById('status');
const aiResponseDiv = document.getElementById('ai-response');

// --- NEW: Speech Synthesis Setup ---
const synth = window.speechSynthesis;
let utteranceQueue = []; // A queue to hold the text chunks to be spoken
let isSpeaking = false; // A flag to prevent multiple speech processes at once

let mediaRecorder;
let audioChunks = [];
let history = [];

startButton.addEventListener('click', startRecording);
stopButton.addEventListener('click', stopRecording);

// --- NEW: Function to handle speaking the queued text ---
function speakQueue() {
    if (isSpeaking || utteranceQueue.length === 0) {
        return; // Don't start a new speech if one is already in progress or if the queue is empty
    }

    isSpeaking = true;
    const utterance = utteranceQueue.shift(); // Get the next text chunk from the queue

    utterance.onend = () => {
        isSpeaking = false;
        // After one utterance finishes, immediately try to speak the next one
        speakQueue();
    };

    utterance.onerror = (event) => {
        console.error('SpeechSynthesisUtterance.onerror', event);
        isSpeaking = false;
        speakQueue(); // Try the next one even if this one fails
    };

    synth.speak(utterance);
}

// --- NEW: Function to add text to the speech queue ---
function speakText(text) {
    // Create a new speech object for the text
    const utterance = new SpeechSynthesisUtterance(text);
    utteranceQueue.push(utterance);
    speakQueue(); // Start the speech process
}

// --- NEW: Interruption Logic ---
// If the user starts recording, we should stop the AI from speaking.
function interruptSpeech() {
    if (synth.speaking) {
        utteranceQueue = []; // Clear the queue of anything pending
        synth.cancel();      // Stop any current speech immediately
        isSpeaking = false;
    }
}

async function startRecording() {
    interruptSpeech(); // Interrupt any ongoing speech
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

        mediaRecorder.ondataavailable = event => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64Audio = reader.result.split(',')[1];
                sendAudioToServer(base64Audio);
            };
            reader.readAsDataURL(audioBlob);
            audioChunks = [];
        };

        mediaRecorder.start();
        startButton.disabled = true;
        stopButton.disabled = false;
        statusDiv.textContent = 'Listening...';
        aiResponseDiv.textContent = ''; // Clear previous response
    } catch (error) {
        console.error('Error accessing microphone:', error);
        statusDiv.textContent = 'Error: Could not access microphone.';
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
    startButton.disabled = false;
    stopButton.disabled = true;
    statusDiv.textContent = 'Thinking...';
}

async function sendAudioToServer(audio) {
    try {
        const response = await fetch('/api/dialog', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ audio, history }),
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.statusText}`);
        }

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
                        const textChunk = data.text;
                        fullResponse += textChunk;
                        aiResponseDiv.textContent = fullResponse; // Update the UI in real-time
                        speakText(textChunk); // --- MODIFIED: Speak the text chunk ---
                    }
                }
            }
        }

        // Keep track of the full conversation for context
        if (fullResponse) {
             history.push({ role: 'user', parts: [{ text: 'User audio input' }] }); // Placeholder for user turn
             history.push({ role: 'model', parts: [{ text: fullResponse }] });
        }

        statusDiv.textContent = 'Click the button and start speaking';

    } catch (error) {
        console.error("Error sending audio to server:", error);
        statusDiv.textContent = 'Error processing your request.';
    }
}