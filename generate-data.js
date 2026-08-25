const fs = require('fs');

const API_KEY = process.env.OPENROUTER_API_KEY;

if (!API_KEY) {
  console.error("Erreur : La clé OPENROUTER_API_KEY n'est pas configurée dans GitHub.");
  process.exit(1);
}

// Liste de modèles 100 % gratuits avec fallback automatique
const FREE_MODELS = [
  "google/gemma-2-9b-it:free",
  "qwen/qwen-2.5-72b-instruct:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  "mistralai/mistral-7b-instruct:free"
];

const systemPrompt = `
You are a senior loyalty, CRM and customer engagement strategy consultant supporting Epsilon teams advising Flying Blue.
Generate a comprehensive strategic intelligence report.

CRITICAL REQUIREMENT:
- Generate 6 distinct, rich strategic loyalty insights.
- Regions to cover: Nordics, Europe, North America, Middle East / APAC.
- Topics: Loyalty economics, Co-brand strategy, Status perks, CRM innovations.

OUTPUT FORMAT:
Return ONLY raw valid JSON adhering strictly to this format:
{
  "date": "YYYY-MM-DD",
  "executive_summary": {
    "top_opportunity": "...",
    "key_risk": "...",
    "most_inspiring_idea": "...",
    "weak_signal_to_watch": "..."
  },
  "insights": [
    {
      "id": 1,
      "title": "...",
      "category": "Airline Loyalty",
      "region": "Nordics",
      "strategic_relevance": 5,
      "recommendation_potential": 4,
      "what_happened": "...",
      "why_it_matters": "...",
      "potential_relevance": "...",
      "suggested_epsilon_use": "...",
      "source_name": "...",
      "source_date": "YYYY-MM-DD",
      "source_url": "https://...",
      "verification_status": "Primary confirmed"
    }
  ]
}
`;

function extractJson(text) {
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error("Aucune structure JSON valide trouvée dans la réponse.");
  }
  
  return text.substring(firstBrace, lastBrace + 1);
}

async function main() {
  const today = new Date().toISOString().split('T')[0];
  let lastError = null;

  for (const model of FREE_MODELS) {
    try {
      console.log(`Essai avec le modèle gratuit : ${model}...`);
      
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Generate the loyalty strategic report for ${today} with 6 rich insights across airline loyalty (SAS, Finnair, Flying Blue, Delta, etc.).` }
          ]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`Échec du modèle ${model} (${response.status}): ${errorText}`);
        continue;
      }

      const data = await response.json();
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        console.warn(`Réponse vide du modèle ${model}`);
        continue;
      }

      const rawContent = data.choices[0].message.content;
      const cleanJsonText = extractJson(rawContent);

      // Validation JSON
      JSON.parse(cleanJsonText);

      fs.writeFileSync('data.json', cleanJsonText);
      console.log(`✅ Succès avec le modèle ${model} ! data.json mis à jour.`);
      return; // Succès, on sort de la boucle

    } catch (error) {
      console.warn(`Erreur lors du traitement avec ${model}:`, error.message);
      lastError = error;
    }
  }

  console.error(' Tous les modèles gratuits ont échoué.');
  process.exit(1);
}

main();
