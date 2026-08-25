import os
import datetime
import json
import time
import feedparser
import requests
from supabase import create_client, Client

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
HF_TOKEN = os.environ.get("HF_TOKEN")

HF_API_URL = "https://router.huggingface.co/v1/chat/completions"
HEADERS = {
    "Authorization": f"Bearer {HF_TOKEN}",
    "Content-Type": "application/json"
}

RSS_FEEDS = [
    "https://simpleflying.com/feed/category/loyalty-programs/",
    "https://thepointsguy.com/feed/",
    "https://loyaltylobby.com/feed/",
    "https://www.flightglobal.com/rss/news",
    "https://headforpoints.com/feed/",
    "https://onemileatatime.com/feed/"
]

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def fetch_rss_articles(days_back=30):
    cutoff_date = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=days_back)
    articles = []
    seen_urls = set()

    for url in RSS_FEEDS:
        print(f"📡 Parsing RSS feed: {url}")
        feed = feedparser.parse(url)
        for entry in feed.entries:
            link = entry.get("link", "")
            if link in seen_urls:
                continue
            
            published_parsed = entry.get("published_parsed") or entry.get("updated_parsed")
            if published_parsed:
                pub_date = datetime.datetime(*published_parsed[:6], tzinfo=datetime.timezone.utc)
                if pub_date < cutoff_date:
                    continue
            else:
                pub_date = datetime.datetime.now(datetime.timezone.utc)

            articles.append({
                "title": entry.get("title", ""),
                "summary": entry.get("summary", entry.get("description", "")),
                "url": link,
                "published_at": pub_date.isoformat()
            })
            seen_urls.add(link)

    print(f"Total articles trouvés (30 derniers jours) : {len(articles)}")
    return articles

def analyze_article_with_ai(article):
    prompt = f"""Tu es un expert mondial en programmes de fidélité aériens et CRM.
Analyse l'article suivant et retourne STRICTEMENT un objet JSON valide (sans markdown, sans ```json) avec la structure exacte suivante :
{{
  "title_fr": "Titre explicatif et percutant en Français",
  "summary_fr": "Analyse stratégique en 2-3 phrases des impacts.",
  "category": "Airline Loyalty",
  "region": "Europe",
  "impact_score": 4
}}

Article Titre: {article['title']}
Article Contenu: {article['summary']}
"""

    payload = {
        "model": "meta-llama/Llama-3.3-70B-Instruct",
        "messages": [
            {"role": "system", "content": "You output only valid JSON."},
            {"role": "user", "content": prompt}
        ],
        "max_tokens": 400,
        "temperature": 0.2
    }

    try:
        response = requests.post(HF_API_URL, headers=HEADERS, json=payload, timeout=25)
        res_json = response.json()
        raw_text = res_json["choices"][0]["message"]["content"].strip()
        
        if "```json" in raw_text:
            raw_text = raw_text.split("```json")[1].split("```")[0].strip()
        elif "```" in raw_text:
            raw_text = raw_text.split("```")[1].split("```")[0].strip()

        return json.loads(raw_text)
    except Exception as e:
        print(f"⚠️ Erreur analyse IA: {e}")
        return None

def run_backfill(max_items=60):
    articles = fetch_rss_articles(days_back=30)
    articles = articles[:max_items]
    inserted_count = 0

    for idx, art in enumerate(articles, 1):
        print(f"[{idx}/{len(articles)}] Traitement : {art['title'][:50]}...")
        
        # Vérif doublon par URL
        existing = supabase.table("insights").select("id").eq("url", art["url"]).execute()
        if existing.data:
            print("   ⏩ Déjà présent dans Supabase.")
            continue

        ai_res = analyze_article_with_ai(art)
        if not ai_res:
            continue

        record = {
            "title": ai_res.get("title_fr", art["title"]),
            "what_happened": ai_res.get("summary_fr", art["summary"]),
            "why_it_matters": "Identifié via la veille rétrospective des 30 derniers jours.",
            "suggested_epsilon_use": "Analyser la tendance pour l'adapter aux stratégies client.",
            "category": ai_res.get("category", "Airline Loyalty"),
            "region": ai_res.get("region", "Europe"),
            "strategic_relevance": ai_res.get("impact_score", 3),
            "recommendation_potential": 4,
            "source_name": "Industry RSS",
            "source_date": art["published_at"][:10],
            "url": art["url"],
            "verification_status": "Primary confirmed"
        }

        try:
            supabase.table("insights").insert(record).execute()
            inserted_count += 1
            print(f"   ✅ Inséré avec succès !")
        except Exception as e:
            print(f"   ❌ Erreur insertion Supabase : {e}")
        
        time.sleep(1)

    print(f"\n🎉 Backfill terminé ! {inserted_count} nouveaux insights ajoutés.")

if __name__ == "__main__":
    run_backfill(max_items=60)
