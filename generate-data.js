const HF_TOKEN = process.env.HF_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const today = new Date().toISOString().split('T')[0];

function extractJson(text) {
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error("No valid JSON found in model output.");
  }
  return text.substring(firstBrace, lastBrace + 1);
}

async function saveToSupabase(insights) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("❌ SUPABASE_URL ou SUPABASE_SERVICE_KEY manquant !");
    return;
  }

  // Insertion avec option ignoreDuplicates sur le titre
  const response = await fetch(`${SUPABASE_URL}/rest/v1/insights`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_SERVICE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "resolution=ignore-duplicates"
    },
    body: JSON.stringify(insights)
  });

  if (response.ok) {
    console.log(`✅ ${insights.length} insights synchronisés avec succès dans Supabase !`);
  } else {
    const errorText = await response.text();
    console.error("❌ Erreur lors de la sauvegarde Supabase :", errorText);
  }
}

async function fetchPass(promptTopic) {
  if (!HF_TOKEN) return null;

  const systemPrompt = `You are a senior loyalty and CRM strategy consultant for Flying Blue / Epsilon.
Generate a daily strategic intelligence report in ENGLISH ONLY. Every single field MUST be in English.

OUTPUT FORMAT: Return ONLY RAW VALID JSON matching this exact structure:
{
  "insights": [
    {
      "title": "...",
      "category": "Airline Loyalty / CRM & Personalization / Co-Brand & Partners / Hospitality Loyalty / Data & AdTech",
      "region": "Nordics / Europe / North America / APAC / Middle East",
      "strategic_relevance": 5,
      "recommendation_potential": 4,
      "what_happened": "...",
      "why_it_matters": "...",
      "potential_relevance": "...",
      "suggested_epsilon_use": "...",
      "source_name": "...",
      "source_date": "${today}",
      "source_url": "https://...",
      "verification_status": "Primary confirmed"
    }
  ]
}`;

  try {
    const response = await fetch(
      "https://api-inference.huggingface.co/models/meta-llama/Llama-3.2-3B-Instruct/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${HF_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "meta-llama/Llama-3.2-3B-Instruct",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Generate 7 distinct strategic loyalty insights in ENGLISH focused on: ${promptTopic}.` }
          ],
          max_tokens: 2800,
          temperature: 0.7
        })
      }
    );

    if (response.ok) {
      const data = await response.json();
      const rawContent = data.choices[0].message.content;
      return JSON.parse(extractJson(rawContent));
    }
  } catch (e) {
    console.warn("API pass failed:", e.message);
  }
  return null;
}

async function main() {
  const allInsights = [];

  console.log("Pass 1/2: Generating Airline & Alliance Insights...");
  const pass1 = await fetchPass("Airline Loyalty, Alliances (SkyTeam/Star Alliance/Oneworld), Nordic Airlines (SAS, Finnair, Norwegian), and Status Reciprocity");
  if (pass1 && pass1.insights) allInsights.push(...pass1.insights);

  console.log("Pass 2/2: Generating CRM, Co-Brand & Hospitality Insights...");
  const pass2 = await fetchPass("Loyalty Credit Cards, Co-Brand Partnerships, Hospitality Programs (Strawberry, Scandic), AI CRM Personalization, and Dynamic Pricing");
  if (pass2 && pass2.insights) allInsights.push(...pass2.insights);

  if (allInsights.length > 0) {
    await saveToSupabase(allInsights);
  } else {
    console.log("Aucune donnée générée par l'API.");
  }
}

main();
