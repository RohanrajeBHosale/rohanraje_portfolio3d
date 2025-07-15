// ingest.js
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// A slightly more advanced chunking function
function getKnowledgeChunks() {
    const directoryPath = path.join(__dirname, 'knowledge');
    const files = fs.readdirSync(directoryPath).filter(file => file.endsWith('.md'));
    let chunks = [];
    for (const file of files) {
        const content = fs.readFileSync(path.join(directoryPath, file), 'utf-8');
        // Remove markdown headers and then split, creating cleaner chunks
        const cleanedContent = content.replace(/^(#+)\s*(.*)$/gm, '$2');
        chunks.push(...cleanedContent.split('\n\n').filter(chunk => chunk.trim().length > 50)); // Only take substantial chunks
    }
    return chunks;
}

async function main() {
    console.log('Starting ingestion with improved chunking...');
    const chunks = await getKnowledgeChunks();
    if (chunks.length === 0) {
        console.error('No chunks found. Check your knowledge files and chunking logic.');
        return;
    }
    console.log(`Found ${chunks.length} high-quality chunks of knowledge.`);

    const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

    console.log('Generating embeddings...');
    const requests = chunks.map(chunk => ({
        content: { parts: [{ text: chunk }] }
    }));
    const result = await embeddingModel.batchEmbedContents({ requests });
    const embeddings = result.embeddings;

    if (!embeddings || embeddings.length !== chunks.length) {
        throw new Error('Mismatch between chunks and generated embeddings.');
    }

    const documents = chunks.map((chunk, i) => ({
        content: chunk,
        embedding: embeddings[i].values,
    }));

    console.log('Deleting old documents...');
    await supabase.from('documents').delete().neq('id', 0);

    console.log('Uploading new documents to Supabase...');
    const { data, error } = await supabase.from('documents').insert(documents);

    if (error) {
        console.error('Error inserting documents:', error);
    } else {
        console.log('Ingestion complete! Your ROHbot is now smarter.');
    }
}

main();