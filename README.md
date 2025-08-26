🎙️ Gemini Live Voice Assistant for Revolt Motors

This project is a real-time, conversational voice interface built to replicate the core functionality of the Revolt Motors voice chatbot.

It uses a server-to-server architecture with a Node.js backend and a vanilla JavaScript frontend, powered by the Google Gemini Live API.

The application allows for a natural, voice-driven conversation:

The user can speak to the assistant, which automatically detects when they’ve finished speaking.

The request is processed, and the assistant responds with synthesized voice.

The user can also interrupt (barge-in) the assistant’s response simply by speaking again.

✨ Key Features

Real-time Conversation: Low-latency, streaming responses for a natural conversational flow.

Voice Activity Detection (VAD): Automatically detects when the user stops speaking — no "stop" button needed.

Voice Barge-In: Users can interrupt the AI while it is speaking simply by talking again.

Single-Button UI: A clean and simple interface controlled by a single, multi-state button.

Server-Sent Events (SSE): The backend streams text responses to the frontend, which are queued for speech synthesis.

Pure Voice Interface: The AI’s responses are spoken aloud, not written to the screen.

🛠️ Tech Stack

Backend: Node.js, Express.js

Frontend: HTML5, CSS3, Vanilla JavaScript

Core APIs:

Google Gemini Live API → Speech-to-text, generative AI responses, and text-to-speech

Web Speech API (Browser) → Client-side text-to-speech

Web Audio API (Browser) → Microphone input and real-time voice activity analysis

📋 Prerequisites

Before running the project, make sure you have:

Node.js: Version 18.x or later (Download here
)

npm: Comes bundled with Node.js

Google Gemini API Key: Get one free at Google AI Studio

Modern Web Browser: Chrome, Edge, or Firefox recommended

Microphone: Required for voice input

🚀 Setup and Installation
1. Clone the Repository
git clone https://github.com/your-username/revolt-gemini-live.git
cd revolt-gemini-live

2. Install Dependencies
npm install

3. Configure Environment Variables

Create a .env file in the root directory:

API_KEY=YOUR_GEMINI_API_KEY_HERE

4. Run the Application
node server.js


You should see:

Server is running on port 3000

5. Open in Browser

Navigate to:
👉 http://localhost:3000

Grant microphone access when prompted. Now you can start conversing with the AI 🎤🤖

🔧 Tuning and Troubleshooting
⚡ Voice Interruption (Barge-In) Sensitivity

The barge-in feature depends on detecting the user’s voice volume compared to the AI’s speech.
This can vary based on microphone, speaker volume, and background noise.

You can adjust it in public/js/main.js:

const INTERRUPTION_THRESHOLD = 0.25;


If the AI stops after one word → Threshold is too low. Increase it (e.g., 0.3 or 0.35).

If you cannot interrupt the AI → Threshold is too high. Decrease it (e.g., 0.2 or 0.18).

💡 Pro Tip: For the best experience, use a headset with a microphone. This prevents feedback and makes barge-in flawless.