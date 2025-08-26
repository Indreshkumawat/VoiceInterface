# Gemini Live Voice Assistant for Revolt Motors

This project is a real-time, conversational voice interface built to replicate the core functionality of the Revolt Motors voice chatbot. It uses a server-to-server architecture with a Node.js backend and a vanilla JavaScript frontend, powered by the Google Gemini Live API.

The application allows for a natural, voice-driven conversation. The user can speak to the assistant, which automatically detects when the user has finished speaking, processes the request, and responds with synthesized voice. The user can also interrupt (barge-in) the assistant's response simply by starting to speak again.

## ✨ Key Features

-   **Real-time Conversation**: Low-latency, streaming responses for a natural conversational flow.
-   **Voice Activity Detection (VAD)**: The application automatically detects when the user stops speaking for a set duration and sends the audio for processing. No "stop" button is needed for this interaction.
-   **Voice Barge-In**: Users can interrupt the AI while it is speaking simply by starting to talk again. The AI will immediately stop and listen to the new input.
-   **Single-Button UI**: A clean and simple interface controlled by a single, multi-state button for starting, stopping, and interrupting the conversation.
-   **Server-Sent Events (SSE)**: The backend streams text responses to the frontend, which are then queued for speech synthesis, ensuring the AI can start speaking as soon as the first words are generated.
-   **Pure Voice Interface**: The AI's responses are spoken aloud, not written to the screen, creating a true voice-only experience.

## 🛠️ Tech Stack

-   **Backend**: Node.js, Express.js
-   **Frontend**: HTML5, CSS3, Vanilla JavaScript
-   **Core APIs**:
    -   **Google Gemini Live API**: For speech-to-text and generative AI responses.
    -   **Web Speech API (Browser)**: For client-side text-to-speech synthesis.
    -   **Web Audio API (Browser)**: For capturing microphone input and performing real-time voice activity analysis.

## 📋 Prerequisites

Before you begin, ensure you have the following installed and configured:

1.  **Node.js**: Version 18.x or later. You can download it from [nodejs.org](https://nodejs.org/).
2.  **npm**: Node Package Manager (comes bundled with Node.js).
3.  **Google Gemini API Key**: You need a free API key from Google AI Studio. You can create one at [aistudio.google.com](https://aistudio.google.com/).
4.  **A Modern Web Browser**: Chrome, Edge, or Firefox are recommended for best support of the Web Audio and Web Speech APIs.
5.  **A Microphone**: Required for voice input.

## 🚀 Setup and Installation

Follow these steps to get the application running on your local machine.

### 1. Clone the Repository

Clone this project to your local machine using your preferred method.

## 2. Install Dependencies
Install the required Node.js packages defined in package.json.

**npm install**

## 3. Configure Environment Variables
The application uses a .env file to securely store your API key.
Create a new file named .env in the root of the project directory.
Add the following line to this file, replacing the placeholder with your actual Gemini API key:

API_KEY=YOUR_GEMINI_API_KEY_HERE

## 4. Run the Application
Start the backend server with the following command:

**node server.js**

You should see a confirmation message in your terminal:

**Server is running on port 3000**

## 5. Open in Browser
Open your web browser and navigate to the following address:

**http://localhost:3000** 


Your browser will likely ask for permission to use your microphone. Please grant access to allow the application to function. You can now start conversing with the AI!

## 🔧 Tuning and Troubleshooting
Voice Interruption (Barge-In) is Too Sensitive or Not Sensitive Enough

The most critical part of the user experience is the voice barge-in feature, which relies on detecting the volume of the user's voice over the AI's spoken response. This can vary greatly depending on your microphone, speaker volume, and ambient noise.

You can easily tune this by editing one variable in the public/js/main.js file:
const INTERRUPTION_THRESHOLD = 0.25;

If the AI interrupts itself (stops after speaking one word): This means the threshold is too low and it's detecting its own voice. Increase this value (e.g., to 0.3 or 0.35).

If you cannot interrupt the AI with your voice: This means the threshold is too high. Decrease this value (e.g., to 0.2 or 0.18).
**Tip:** For the best and most reliable experience, use a headset with a microphone. This completely prevents the feedback loop and makes the barge-in feature work flawlessly.