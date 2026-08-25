const fs = require('fs');

const API_KEY = process.env.OPENROUTER_API_KEY;

if (!API_KEY) {
  console.error("Erreur : La clé OPENROUTER_API_KEY n'est pas configurée dans GitHub.");
  process.exit(1);
}

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

// Fonction robuste pour extraire uniquement la structure JSON
function extractJson(text) {
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error("Aucune structure JSON valide trouvée dans la réponse de l'IA.");
  }
  
  return text.substring(firstBrace, lastBrace + 1);
}

async function main() {
  try {
    const today = new Date().toISOString().split('T')[0];

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.3-70b-instruct:free", // Modèle puissant, rapide et gratuit
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate the loyalty strategic report for ${today} with 6 rich insights across airline loyalty (SAS, Finnair, Flying Blue, Delta, etc.).` }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error("Réponse OpenRouter vide ou incomplète.");
    }

    const rawContent = data.choices[0].message.content;
    const cleanJsonText = extractJson(rawContent);

    // Validation syntaxique
    JSON.parse(cleanJsonText);

    fs.writeFileSync('data.json', cleanJsonText);
    console.log('data.json mis à jour avec succès avec 6 insights riches !');
  } catch (error) {
    console.error('Erreur lors de la génération :', error);
    process.exit(1);
  }
}

main();
