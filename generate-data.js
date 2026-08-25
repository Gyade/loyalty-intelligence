const fs = require('fs');

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error("Erreur : La clé GEMINI_API_KEY n'est pas configurée dans les secrets GitHub.");
  process.exit(1);
}

// Utilisation de l'endpoint stable v1beta
const URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;

const systemPrompt = `
You are a senior loyalty, CRM and customer engagement strategy consultant supporting Epsilon teams that advise Flying Blue.
Your objective is to identify insights, benchmarks, opportunities, risks and innovation ideas.

RESEARCH SCOPE: Monitor airline, travel and hospitality loyalty, CRM, personalization, AI, and Nordic loyalty (SAS EuroBonus, Finnair Plus, Norwegian Reward, Strawberry, Scandic Friends).

Scoring: Assign Strategic Relevance (1-5) and Recommendation Potential (1-5). Only include items scoring 3/5 or higher.

OUTPUT FORMAT: Return ONLY a valid JSON object matching this exact structure, with no markdown code blocks around it:
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
      "strategic_relevance": 4,
      "recommendation_potential": 5,
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

async function main() {
  try {
    const today = new Date().toISOString().split('T')[0];

    const payload = {
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [{
        parts: [{ text: `Generate the daily loyalty intelligence report for ${today}. Provide strategic insights on airline loyalty, CRM innovation, and Nordic programs.` }]
      }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };

    const response = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.candidates || !data.candidates[0].content.parts[0].text) {
      throw new Error("Réponse API invalide ou vide.");
    }

    let jsonText = data.candidates[0].content.parts[0].text.trim();

    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/```$/, '');
    }

    // Validation syntaxique du JSON
    JSON.parse(jsonText);

    fs.writeFileSync('data.json', jsonText);
    console.log('data.json mis à jour avec succès !');
  } catch (error) {
    console.error('Erreur lors de la génération :', error);
    process.exit(1);
  }
}

main();
