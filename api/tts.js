// api/tts.js
const axios = require('axios');

module.exports = async (req, res) => {
    // Set CORS headers for all responses
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-control-allow-headers', 'Content-Type');

    // Handle the preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Handle the actual POST request
    if (req.method === 'POST') {
        const { text } = req.body;

        if (!text) {
            return res.status(400).send({ message: 'Text is required' });
        }

        const XI_API_KEY = process.env.ELEVENLABS_API_KEY;
        const VOICE_ID = 'RBJ2S1JklYXJtRTqaggc'; // Ensure this is your correct Voice ID

        if (!XI_API_KEY) {
            console.error("ElevenLabs API Key is not configured on Vercel.");
            return res.status(500).send({ message: 'Server configuration error: Missing API Key.' });
        }

        // --- THIS IS THE OPTIMIZED STREAMING CODE ---
        try {
            const response = await axios({
                method: 'POST',
                url: `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`, // Use the /stream endpoint
                data: {
                    text: text,
                    model_id: 'eleven_monolingual_v1', // Or a newer model like eleven_turbo_v2
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75,
                    },
                },
                headers: {
                    'Accept': 'audio/mpeg',
                    'xi-api-key': XI_API_KEY,
                    'Content-Type': 'application/json',
                },
                responseType: 'stream', // We are back to using a stream for speed
            });

            // Set the content type header so the browser knows it's an audio file
            res.setHeader('Content-Type', 'audio/mpeg');

            // Pipe the audio stream from ElevenLabs directly to the browser response.
            // This is the key to low-latency playback.
            response.data.pipe(res);

        } catch (error) {
            const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
            console.error('Error from ElevenLabs streaming endpoint:', errorMessage);
            res.status(500).send({ message: `Error generating speech stream: ${errorMessage}` });
        }

    } else {
        res.setHeader('Allow', ['POST', 'OPTIONS']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
};