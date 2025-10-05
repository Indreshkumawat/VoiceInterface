// server.js
const express = require('express');
const http = require('http');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

app.use(cors()); 

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
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
        });

        const chat = model.startChat({
            history: history || [],
        });

        const result = await chat.sendMessageStream([
            { inlineData: { mimeType: 'audio/webm', data: audio } }
        ]);

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        for await (const chunk of result.stream) {
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