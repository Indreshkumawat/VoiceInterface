// server.js
const express = require('express');
const http = require('http');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// --- FIX 1: Increase the payload size limit ---
// This is necessary to handle the larger size of audio file data being sent.
// We set a generous limit of '50mb'.
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));


app.use(express.static('public'));

const genAI = new GoogleGenerativeAI(process.env.API_KEY);

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.post('/api/dialog', async (req, res) => {
    try {
        const { audio, history } = req.body;

        // --- FIX 2: Use a valid and available model name ---
        // 'gemini-1.5-flash' is a current and stable model that supports audio input.
        // The original model name was likely incorrect or not available.
        const model = genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
            systemInstruction: "You are a helpful assistant for Revolt Motors. Only answer questions related to Revolt Motors' products, services, and company information. If the user asks about something else, politely decline and steer the conversation back to Revolt Motors.",
        });

        const chat = model.startChat({
            history: history || [],
        });

        // The audio data from the client is Base64 encoded, but the SDK expects it directly.
        // We need to pass the mimeType and the Base64 data string.
        const result = await chat.sendMessageStream([
            { inlineData: { mimeType: 'audio/webm', data: audio } }
        ]);

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        for await (const chunk of result.stream) {
            // Check if the chunk and its text part exist before sending
            if (chunk && chunk.text()) {
                res.write(`data: ${JSON.stringify({ text: chunk.text() })}\n\n`);
            }
        }
        res.end();

    } catch (error) {
        console.error("Error in /api/dialog:", error);
        res.status(500).send('An error occurred during the API call.');
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});