const fs = require('fs');
const Parser = require('rss-parser');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenAI } = require('@google/genai');
const WebSocket = require('ws');

const parser = new Parser();

const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_SERVICE_KEY, 
    { auth: { persistSession: false }, realtime: { transport: WebSocket } }
);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function fetchRssFeed(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/rss+xml, application/xml, text/xml, */*'
            },
            timeout: 10000
        });
        return await parser.parseString(response.data);
    } catch (e) {
        throw new Error(`Erreur HTTP ou parsing: ${e.message}`);
    }
}

// Fonction pour filtrer le bruit évident en amont (ex: promos de cartes, forums, faits divers)
function isIrrelevantTitle(title) {
    const lower = title.toLowerCase();
    const blacklist = [
        'bonus', 'sign-up', 'sign up', 'review:', 'win 1 million', 'bits:', 
        'chat thread', 'forum', 'deal', 'sale', 'save the points', 'credit card',
        'esim', 'railcards', 'lounge closed', 'kicked them both off', 'runs toward active runway'
    ];
    return blacklist.some(term => lower.includes(term));
}

async function analyzeWithGemini(article) {
    const prompt = `You are a senior loyalty and CRM strategy consultant for Flying Blue / Epsilon.
Analyze the following article originating from the industry source '${article.source_name}'. 

CRITICAL FILTERING RULE:
If this article is just a minor credit card promotion, a sign-up bonus offer, a personal blog "bits/news round-up", a simple hotel review, or an irrelevant local news/incident without deep strategic impact on enterprise CRM, loyalty economics, or data/adtech ecosystems, you MUST return a JSON with "strategic_relevance": 1. 

Otherwise, return a valid JSON object (no markdown formatting, no \`\`\`json) with this exact structure:
{
  "title": "Clear, impactful strategic title in ENGLISH",
  "what_happened": "Concise summary of what happened in 2-3 sentences in ENGLISH.",
  "why_it_matters": "Strategic analysis of why it matters for enterprise loyalty / CRM in ENGLISH.",
  "suggested_epsilon_use": "Actionable recommendation for CRM / personalization strategy in ENGLISH.",
  "category": "Airline Loyalty / CRM & Personalization / Co-Brand & Partners / Hospitality Loyalty / Data & AdTech",
  "region": "Europe / North America /APAC / Middle East / Global",
  "strategic_relevance": (number from 1 to 5. Put 1 or 2 if it's low interest, 4 or 5 if it's a major industry shift)
}

Article Title: ${article.title}
Article Content: ${article.summary}
`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: prompt,
        });

        let rawText = response.text.trim();
        if (rawText.startsWith("```json")) {
            rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
        } else if (rawText.startsWith("```")) {
            rawText = rawText.replace(/```/g, "").trim();
        }

        return JSON.parse(rawText);
    } catch (e) {
        console.error(`⚠️ Erreur analyse Gemini pour "${article.title}":`, e.message);
        return null;
    }
}

async function runFetcher() {
    console.log("🚀 Lancement de la récupération intelligente avec Gemini...");
    
    let sources = [];
    try {
        const fileContent = fs.readFileSync('sources.json', 'utf-8');
        sources = JSON.parse(fileContent);
    } catch (e) {
        console.error("❌ Impossible de lire sources.json :", e.message);
        return;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 3);

    let insertedCount = 0;

    for (const source of sources) {
        console.log(`📡 Parsing [${source.region}] ${source.name}: ${source.url}`);
        try {
            const feed = await fetchRssFeed(source.url);
            for (const item of feed.items) {
                const link = item.link;
                if (!link) continue;

                const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
                if (pubDate < cutoffDate) continue;

                // Filtrage rapide par mots-clés indésirables
                if (isIrrelevantTitle(item.title)) {
                    // console.log(`   ⏭️ Ignoré (bruit détecté) : ${item.title}`);
                    continue;
                }

                const { data: existing, error: selectError } = await supabase
                    .from('insights')
                    .select('id')
                    .eq('url', link);

                if (selectError) continue;
                if (existing && existing.length > 0) continue;

                console.log(`   ✨ Analyse en cours : ${item.title}`);
                
                const articleData = {
                    source_name: source.name,
                    title: item.title,
                    summary: item.contentSnippet || item.content || item.summary || ""
                };

                let aiRes = await analyzeWithGemini(articleData);
                
                // Si l'IA estime que la pertinence est faible (< 3), on ignore l'insertion !
                if (!aiRes || aiRes.strategic_relevance < 3) {
                    console.log(`   ⏭️ Écarté par l'IA (Pertinence faible : ${aiRes ? aiRes.strategic_relevance : 'N/A'})`);
                    continue;
                }

                const record = {
                    title: aiRes.title || item.title,
                    what_happened: aiRes.what_happened || articleData.summary,
                    why_it_matters: aiRes.why_it_matters || "Identified via automated monitoring.",
                    suggested_epsilon_use: aiRes.suggested_epsilon_use || "Leverage for lifecycle CRM.",
                    category: aiRes.category || "Airline Loyalty",
                    region: aiRes.region || source.region,
                    strategic_relevance: aiRes.strategic_relevance,
                    recommendation_potential: 4,
                    source_name: source.name,
                    source_date: pubDate.toISOString().split('T')[0],
                    url: link,
                    verification_status: "Primary confirmed"
                };

                const { error } = await supabase.from('insights').insert([record]);
                if (error) {
                    console.error(`   ❌ Erreur insertion Supabase :`, error.message);
                } else {
                    insertedCount++;
                    console.log(`   ✅ Insight stratégique validé et inséré !`);
                }

                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        } catch (e) {
            console.error(`⚠️ Erreur flux ${source.name}:`, e.message);
        }
    }

    console.log(`🎉 Mise à jour terminée ! ${insertedCount} insights pertinents ajoutés.`);
}

runFetcher();
