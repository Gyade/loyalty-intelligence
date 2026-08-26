const fs = require('fs');
const Parser = require('rss-parser');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws'); // 👈 Import de ws

const parser = new Parser({
    customHeaders: {
        'User-Agent': 'Mozilla/5.0 (compatible; EpsilonLoyaltyBot/1.0; +http://example.com)'
    }
});

// 👈 Ajout de l'option transport avec WebSocket
const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_SERVICE_KEY, 
    { auth: { persistSession: false }, global: { headers: { 'x-client-info': 'epsilon-bot' } }, realtime: { transport: WebSocket } }
);

const HF_TOKEN = process.env.HF_TOKEN;

async function analyzeWithAI(article) {
    const prompt = `You are a senior loyalty and CRM strategy consultant for Flying Blue / Epsilon.
Analyze the following article originating from the industry source '${article.source_name}'. 
Maintain a balanced global perspective (covering European, US, and international markets fairly).
Return STRICTLY a valid JSON object (no markdown formatting, no \`\`\`json) with this exact structure:
{
  "title": "Clear, impactful strategic title in ENGLISH",
  "what_happened": "Concise summary of what happened in 2-3 sentences in ENGLISH.",
  "why_it_matters": "Strategic analysis of why it matters for loyalty / CRM in ENGLISH.",
  "suggested_epsilon_use": "Actionable recommendation for CRM / personalization strategy in ENGLISH.",
  "category": "Airline Loyalty / CRM & Personalization / Co-Brand & Partners / Hospitality Loyalty / Data & AdTech",
  "region": "Europe / North America / APAC / Middle East / Global",
  "strategic_relevance": 4
}

Article Title: ${article.title}
Article Content: ${article.summary}
`;

    try {
        const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${HF_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "meta-llama/Llama-3.3-70B-Instruct",
                messages: [
                    { role: "system", content: "You output only valid JSON in English." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 500,
                temperature: 0.2
            })
        });

        const data = await response.json();
        let rawText = data.choices[0].message.content.trim();

        if (rawText.startsWith("```json")) {
            rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
        } else if (rawText.startsWith("```")) {
            rawText = rawText.replace(/```/g, "").trim();
        }

        return JSON.parse(rawText);
    } catch (e) {
        console.error(`⚠️ Erreur analyse IA pour "${article.title}":`, e.message);
        return null;
    }
}

async function runFetcher() {
    console.log("🚀 Lancement de la récupération des flux RSS depuis sources.json...");
    
    let sources = [];
    try {
        const fileContent = fs.readFileSync('sources.json', 'utf-8');
        sources = JSON.parse(fileContent);
    } catch (e) {
        console.error("❌ Impossible de lire sources.json :", e.message);
        return;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 2); // 48 dernières heures

    let insertedCount = 0;

    for (const source of sources) {
        console.log(`📡 Parsing [${source.region}] ${source.name}: ${source.url}`);
        try {
            const feed = await parser.parseURL(source.url);
            for (const item of feed.items) {
                const link = item.link;
                if (!link) continue;

                const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
                if (pubDate < cutoffDate) continue;

                // CORRECTION SUPABASE : Suppression de .execute()
                const { data: existing, error: selectError } = await supabase
                    .from('insights')
                    .select('id')
                    .eq('url', link);

                if (selectError) {
                    console.error(`   ⚠️ Erreur select Supabase:`, selectError.message);
                    continue;
                }

                if (existing && existing.length > 0) {
                    continue; // Déjà présent
                }

                console.log(`   ✨ Nouvel article trouvé : ${item.title}`);
                
                const articleData = {
                    source_name: source.name,
                    title: item.title,
                    summary: item.contentSnippet || item.content || item.summary || ""
                };

                const aiRes = await analyzeWithAI(articleData);
                if (!aiRes) continue;

                const record = {
                    title: aiRes.title || item.title,
                    what_happened: aiRes.what_happened || articleData.summary,
                    why_to_matters: aiRes.why_it_matters || "Identified via automated monitoring.",
                    suggested_epsilon_use: aiRes.suggested_epsilon_use || "Leverage for lifecycle CRM.",
                    category: aiRes.category || "Airline Loyalty",
                    region: aiRes.region || source.region,
                    strategic_relevance: aiRes.strategic_relevance || 4,
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
                    console.log(`   ✅ Inséré avec succès !`);
                }

                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        } catch (e) {
            console.error(`⚠️ Erreur flux ${source.name}:`, e.message);
        }
    }

    console.log(`🎉 Mise à jour terminée ! ${insertedCount} nouveaux insights ajoutés.`);
}

runFetcher();
