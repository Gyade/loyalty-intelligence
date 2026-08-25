const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
      "source_url": "...",
      "verification_status": "Primary confirmed"
    }
  ]
}
`;

async function main() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Generate the daily loyalty intelligence report for ${today}. Conduct web research for the latest news in airline loyalty, CRM, and Nordic travel programs over the past 24-48 hours.`,
      config: {
        systemInstruction: systemPrompt,
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json"
      }
    });

    const jsonText = response.text.trim();
    fs.writeFileSync('data.json', jsonText);
    console.log('data.json successfully updated!');
  } catch (error) {
    console.error('Error generating report:', error);
    process.exit(1);
  }
}

main();
