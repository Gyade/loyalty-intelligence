const fs = require('fs');

const API_KEY = process.env.OPENROUTER_API_KEY;

if (!API_KEY) {
  console.error("Erreur : La clé OPENROUTER_API_KEY n'est pas configurée.");
  process.exit(1);
}

const systemPrompt = `
You are a senior loyalty, CRM and customer engagement strategy consultant supporting Epsilon teams that advise Flying Blue.
Your objective is to produce a comprehensive, dense, high-value strategic intelligence report.

CRITICAL REQUIREMENT FOR QUANTITY AND DIVERSITY:
- You MUST generate between 5 and 8 rich, highly detailed insights for every report.
- Strictly cover diverse regions: Nordics (SAS, Finnair, Norwegian, Strawberry), Europe (Flying Blue, Miles&More, BA), Americas (Delta, United, AA), Middle East / APAC (Emirates, Qatar, Qantas).
- Highlight specific CRM actions, loyalty economics, co-brand strategy shifts, and weak signals.

Scoring: Assign Strategic Relevance (1-5) and Recommendation Potential (1-5). Include insights scoring 3/5 or higher.

OUTPUT FORMAT: Return ONLY a valid JSON object matching this exact structure (no markdown, no triple backticks):
{
  "date": "YYYY-MM-DD",
  "executive_summary": {
    "top_opportunity": "Detailed description of top opportunity...",
    "key_risk": "Detailed description of key risk...",
    "most_inspiring_idea": "Detailed description of inspiring idea...",
    "weak_signal_to_watch": "Detailed description of weak signal..."
  },
  "insights": [
    {
      "id": 1,
      "title": "Title of Insight",
      "category": "Airline Loyalty / CRM / Co-Brand",
      "region": "Nordics / Europe / North America / APAC / Middle East",
      "strategic_relevance": 5,
      "recommendation_potential": 4,
      "what_happened": "Thorough explanation of the strategic move or announcement.",
      "why_it_matters": "Deep consulting analysis of why this changes loyalty dynamics or CRM engagement.",
      "potential_relevance": "Direct impact or trend assessment.",
      "suggested_epsilon_use": "Concrete recommendation, workshop topic, or benchmark application for Epsilon / Flying Blue.",
      "source_name": "Source Name (e.g. Airline News, AwardFares, LoyaltyLobby)",
      "source_date": "YYYY-MM-DD",
      "source_url": "https://...",
      "verification_status": "Primary confirmed"
    }
  ]
}
`;

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
        model: "openrouter/free",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate a full, dense Loyalty Strategy & Intelligence Report for ${today}. Include at least 6 distinct strategic loyalty developments across Nordics, Europe, US, and APAC programs (e.g., Status Credit Rollovers, Co-brand card updates, Dynamic pricing, AI personalization).` }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    let jsonText = data.choices[0].message.content.trim();

    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/```$/, '');
    }

    // Validation du JSON
    JSON.parse(jsonText);

    fs.writeFileSync('data.json', jsonText);
    console.log('data.json mis à jour avec succès avec un rapport enrichi !');
  } catch (error) {
    console.error('Erreur lors de la génération :', error);
    process.exit(1);
  }
}

main();
