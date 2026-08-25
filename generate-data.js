const https = require('https');

const HF_TOKEN = process.env.HF_TOKEN;
let SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const today = new Date().toISOString().split('T')[0];

SUPABASE_URL = SUPABASE_URL.replace(/\/+$/, '');

function postRequest(url, headers, payload) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const data = JSON.stringify(payload);

    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, body });
      });
    });

    req.on('error', (e) => reject(e));
    req.write(data);
    req.end();
  });
}

function extractJson(text) {
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error("Aucun JSON valide trouvé dans la réponse du modèle.");
  }
  return text.substring(firstBrace, lastBrace + 1);
}

async function saveToSupabase(insights) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("❌ SUPABASE_URL ou SUPABASE_SERVICE_KEY manquant !");
    return;
  }

  const endpoint = `${SUPABASE_URL}/rest/v1/insights`;
  const headers = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": "resolution=ignore-duplicates"
  };

  try {
    const res = await postRequest(endpoint, headers, insights);
    if (res.ok) {
      console.log(`✅ ${insights.length} vrais insights Hugging Face synchronisés dans Supabase !`);
    } else {
      console.error("❌ Erreur réponse Supabase :", res.body);
    }
  } catch (err) {
    console.error("❌ Erreur réseau Supabase :", err.message);
  }
}

async function fetchPass(promptTopic) {
  if (!HF_TOKEN) {
    console.warn("⚠️ HF_TOKEN manquant dans les secrets GitHub.");
    return null;
  }

  const systemPrompt = `You are a senior loyalty & CRM strategy consultant for Flying Blue / Epsilon.
Generate a strategic intelligence report in ENGLISH ONLY. Return ONLY RAW VALID JSON matching this structure:
{
  "insights": [
    {
      "title": "...",
      "category": "Airline Loyalty",
      "region": "Europe",
      "strategic_relevance": 5,
      "recommendation_potential": 4,
      "what_happened": "...",
      "why_it_matters": "...",
      "suggested_epsilon_use": "...",
      "source_name": "Industry Intelligence",
      "source_url": "https://news.google.com"
    }
  ]
}`;

  // Utilisation du routeur global universel de Hugging Face
  const HF_GLOBAL_ROUTER = "https://router.huggingface.co/v1/chat/completions";
  const MODEL_NAME = "meta-llama/Llama-3.3-70B-Instruct";

  const payload = {
    model: MODEL_NAME,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Generate 2 high-value strategic loyalty insights in ENGLISH regarding: ${promptTopic}. Output ONLY raw JSON.` }
    ],
    max_tokens: 1500,
    temperature: 0.7
  };

  const headers = {
    "Authorization": `Bearer ${HF_TOKEN}`,
    "Content-Type": "application/json",
    "User-Agent": "NodeJS-HF-Client/1.0"
  };

  try {
    const res = await postRequest(HF_GLOBAL_ROUTER, headers, payload);
    if (res.ok) {
      const data = JSON.parse(res.body);
      if (data.choices && data.choices[0] && data.choices[0].message) {
        const rawContent = data.choices[0].message.content;
        return JSON.parse(extractJson(rawContent));
      }
    } else {
      console.warn(`⚠️ Réponse HF [${res.status}] :`, res.body);
    }
  } catch (e) {
    console.warn("Exception lors de l'appel HF :", e.message);
  }
  return null;
}

async function main() {
  const allInsights = [];

  console.log("Pass 1/2: Génération HF Router - Airline Loyalty & Alliances...");
  const pass1 = await fetchPass("Airline Loyalty programs, status reciprocity, and dynamic award pricing");
  if (pass1 && pass1.insights) allInsights.push(...pass1.insights);

  console.log("Pass 2/2: Génération HF Router - CRM & Co-Brand...");
  const pass2 = await fetchPass("Co-brand credit cards, hyper-personalization, and retail/hospitality partnerships");
  if (pass2 && pass2.insights) allInsights.push(...pass2.insights);

  if (allInsights.length > 0) {
    await saveToSupabase(allInsights);
  } else {
    console.error("❌ Aucune donnée générée par Hugging Face.");
  }
}

main();
