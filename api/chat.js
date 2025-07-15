// api/chat.js
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const systemPrompt = `You are ROHbot, a personal AI assistant for Rohanraje Bhosale. You must act and speak as if you ARE Rohan. Use "I", "my", not "his".
Your tone is professional, confident, and clear.
You have been provided with relevant context scraped from my life and career knowledge base. 
You MUST use this context to form your answer. If the context does not contain the answer, say "That's a great question. While that specific detail isn't in my knowledge base, I can tell you about a related project..." and then pivot to a relevant topic from the context.
Do not make up information. Base your answer strictly on the provided context.`;

module.exports = async (req, res) => {
    // CORS headers...
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'POST') {
        try {
            const { userInput } = req.body;
            if (!userInput) return res.status(400).json({ error: 'User input is required.' });

            // Initialize clients
            const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

            // 1. Retrieve: Embed the user's question and find relevant documents
            const { embedding } = await embeddingModel.embedContent(userInput);
            const { data: documents, error } = await supabase.rpc('match_documents', {
                query_embedding: embedding.values,
                match_threshold: 0.75, // Adjust this threshold as needed
                match_count: 5
            });

            if (error) throw new Error(`Supabase error: ${error.message}`);

            const contextText = documents.map(doc => doc.content).join('\n\n---\n\n');

            // 2. Augment: Create a new prompt for the generation model
            const generationModel = genAI.getGenerativeModel({
                model: "gemini-1.5-flash",
                systemInstruction: systemPrompt
            });

            const augmentedPrompt = `Context: """${contextText}"""\n\nQuestion: """${userInput}"""`;

            // 3. Generate: Get the final answer from Gemini
            const result = await generationModel.generateContent(augmentedPrompt);
            const responseText = await result.response.text();

            res.status(200).json({ reply: responseText });

        } catch (error) {
            console.error("Error in RAG pipeline:", error);
            res.status(500).json({ error: "Failed to process the request." });
        }
    } else {
        res.setHeader('Allow', ['POST', 'OPTIONS']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }
};