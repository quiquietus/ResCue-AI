"""
pipeline.py — ResCue AI Kafka Consumer + AI Processing Pipeline

Runs as a background worker. Consumes disaster posts from Aiven Kafka,
processes them through AI models, and writes enriched data to Firestore.

Usage:
    python pipeline.py
"""

import os
import json
import ssl
import time
import hashlib
import threading
from datetime import datetime
from typing import Optional

from dotenv import load_dotenv
import requests
from groq import Groq
import yake
from kafka import KafkaConsumer

load_dotenv()

# ── Config ───────────────────────────────────────────────────────────────────
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
NEWS_API_KEY = os.getenv("NEWS_API_KEY")
KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka-1bbdb9d4-quiquietus-011.i.aivencloud.com:27060")
KAFKA_USERNAME = os.getenv("KAFKA_USERNAME", "avnadmin")
KAFKA_PASSWORD = os.getenv("KAFKA_PASSWORD", "")
KAFKA_CA_CERT = os.getenv("KAFKA_CA_CERT_PATH", "./ca.pem")
FIREBASE_CREDS = os.getenv("FIREBASE_CREDENTIALS_PATH", "./firebase-service-account.json")

TOPICS = ["reddit_disasters", "bluesky_disaster_posts"]
MODEL = "llama3-8b-8192"

# ── Firebase ─────────────────────────────────────────────────────────────────
try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    if not firebase_admin._apps:
        cred = credentials.Certificate(FIREBASE_CREDS)
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("✅ Firebase connected")
except Exception as e:
    db = None
    print(f"⚠️  Firebase not available: {e}")

# ── Groq Client ───────────────────────────────────────────────────────────────
client = Groq(api_key=GROQ_API_KEY)

# ── Keyword Extractor ────────────────────────────────────────────────────────
kw_extractor = yake.KeywordExtractor(
    lan="en", n=1, dedupLim=0.7, top=5
)

# ── Processed IDs (dedup) ────────────────────────────────────────────────────
_processed = set()


# ── Helpers ───────────────────────────────────────────────────────────────────
def groq_classify(
    prompt: str,
    system: str = "You are a disaster classification assistant. Answer only with the exact label requested.",
) -> str:
    """Single Groq call. Returns stripped content."""
    try:
        chat = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            max_tokens=50,
            temperature=0.0,
        )
        return chat.choices[0].message.content.strip()
    except Exception as e:
        print(f"Groq error: {e}")
        return ""


def is_informative(title: str) -> bool:
    """M1 — Is this post about a real disaster event?"""
    resp = groq_classify(
        f"Is the following social media post about a real disaster event? "
        f"Answer only YES or NO.\n\nPost: {title}"
    )
    return resp.upper().startswith("YES")


def classify_disaster_type(title: str) -> str:
    """M2 — What category of disaster?"""
    resp = groq_classify(
        f"Classify this disaster post into ONE of these categories: "
        f"Flood, Fire, Earthquake, Storm, Drought, Landslide, Tsunami, Cyclone, Other.\n"
        f"Answer with only the category word.\n\nPost: {title}"
    )
    known = {"Flood", "Fire", "Earthquake", "Storm", "Drought", "Landslide", "Tsunami", "Cyclone", "Other"}
    return resp.capitalize() if resp.capitalize() in known else "Other"


def classify_severity(title: str) -> str:
    """M3 — What is the severity level?"""
    resp = groq_classify(
        f"Rate the severity of this disaster: HIGH, MEDIUM, or LOW.\n"
        f"Answer with only one word.\n\nPost: {title}"
    )
    resp_upper = resp.upper()
    if "HIGH" in resp_upper:
        return "high"
    elif "MEDIUM" in resp_upper:
        return "medium"
    return "low"


def extract_keywords(text: str) -> list:
    """Extract keywords using Yake."""
    try:
        keywords = kw_extractor.extract_keywords(text)
        return [kw for kw, score in keywords]
    except Exception:
        return text.split()[:3]


def fetch_news_context(keywords: list) -> str:
    """Fetch top news article for context enrichment."""
    if not NEWS_API_KEY or not keywords:
        return ""
    try:
        query = " ".join(keywords[:3])
        url = (
            f"https://newsapi.org/v2/everything?"
            f"q={query}&sortBy=publishedAt&pageSize=1&language=en&"
            f"apiKey={NEWS_API_KEY}"
        )
        resp = requests.get(url, timeout=10)
        if resp.status_code == 200:
            articles = resp.json().get("articles", [])
            if articles:
                a = articles[0]
                return f"{a.get('title', '')}. {a.get('description', '')}"
    except Exception as e:
        print(f"NewsAPI error: {e}")
    return ""


def generate_enrichment(title: str, news_context: str) -> dict:
    """Final Llama call — generate summary, location, strategy."""
    try:
        prompt = (
            f"You are a disaster response analyst. Given this disaster report and news context, "
            f"extract the following information in JSON format:\n"
            f"{{\"summary\": \"2-3 sentence summary\","
            f" \"location\": \"Specific city/region/country\","
            f" \"injured_or_dead_people\": \"casualty info or Unknown\","
            f" \"Strategy\": \"Recommended NGO response strategy in 2-3 sentences\"}}\n\n"
            f"Disaster Report: {title}\n\n"
            f"News Context: {news_context or 'No additional context available'}\n\n"
            f"Return only valid JSON."
        )
        chat = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": "You are a disaster response analyst. Return only valid JSON."},
                {"role": "user", "content": prompt},
            ],
            max_tokens=400,
            temperature=0.3,
        )
        raw = chat.choices[0].message.content.strip()
        # Extract JSON from response (handles markdown code fences)
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start != -1 and end > start:
            return json.loads(raw[start:end])
    except Exception as e:
        print(f"Enrichment error: {e}")
    return {
        "summary": title,
        "location": "Unknown",
        "injured_or_dead_people": "Unknown",
        "Strategy": "Assess situation and coordinate with local authorities.",
    }


def process_message(raw_msg: dict, source: str):
    """Full AI pipeline for one Kafka message."""
    # Get title (field differs between Reddit and BlueSky)
    title = raw_msg.get("title") or raw_msg.get("Text") or ""
    if not title:
        return

    # Dedup by title hash
    msg_id = hashlib.md5(title.encode()).hexdigest()
    if msg_id in _processed:
        print(f"⏭️  Skipping duplicate: {title[:40]}")
        return
    _processed.add(msg_id)

    print(f"\n🔍 Processing: {title[:60]}...")

    # M1 — Informative filter
    if not is_informative(title):
        print("❌ Not informative — skipping")
        return
    print("✅ M1: Informative")

    # M2 — Disaster category
    label = classify_disaster_type(title)
    print(f"✅ M2: Category = {label}")

    # M3 — Severity
    severity = classify_severity(title)
    print(f"✅ M3: Severity = {severity}")

    # Keyword extraction + News enrichment
    keywords = extract_keywords(title)
    news_context = fetch_news_context(keywords)
    print(f"📰 News context fetched: {bool(news_context)}")

    # Final enrichment
    enrichment = generate_enrichment(title, news_context)
    print(f"📍 Location: {enrichment.get('location', 'Unknown')}")

    # Build Firestore document
    doc = {
        "title": title,
        "summary": enrichment.get("summary", title),
        "Label": label,
        "category": label.lower(),
        "Severity": severity,
        "severity": "Critical" if severity == "high" else ("High" if severity == "medium" else "Low"),
        "Location": enrichment.get("location", "Unknown"),
        "location": enrichment.get("location", "Unknown"),
        "injured_or_dead_people": enrichment.get("injured_or_dead_people", "Unknown"),
        "Strategy": enrichment.get("Strategy", ""),
        "source": source,
        "url": raw_msg.get("url", ""),
        "keywords": keywords,
        "timestamp": datetime.now(),
        "processed_at": datetime.now().isoformat(),
    }

    # Write to Firestore
    if db:
        try:
            db.collection("disaster_reports").document(msg_id).set(doc)
            print(f"🔥 Written to Firestore: {msg_id}")
        except Exception as e:
            print(f"⚠️  Firestore write error: {e}")
    else:
        print(f"📋 (Firebase unavailable) Would write: {json.dumps(doc, default=str, indent=2)}")


# ── Kafka Consumer ────────────────────────────────────────────────────────────
def create_consumer(topics: list):
    """Create Aiven Kafka consumer with SSL + SASL/SCRAM-SHA-256."""
    ssl_context = ssl.create_default_context()
    if os.path.exists(KAFKA_CA_CERT):
        ssl_context = ssl.create_default_context(cafile=KAFKA_CA_CERT)
        print(f"✅ Using CA cert: {KAFKA_CA_CERT}")
    else:
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        print("⚠️  CA cert not found — SSL verification disabled (download ca.pem from Aiven console)")

    consumer = KafkaConsumer(
        *topics,
        bootstrap_servers=KAFKA_BOOTSTRAP,
        security_protocol="SASL_SSL",
        sasl_mechanism="SCRAM-SHA-256",
        sasl_plain_username=KAFKA_USERNAME,
        sasl_plain_password=KAFKA_PASSWORD,
        ssl_context=ssl_context,
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
        auto_offset_reset="earliest",
        enable_auto_commit=True,
        group_id="rescue-ai-pipeline",
        consumer_timeout_ms=60000,
    )
    return consumer


def run_pipeline():
    """Main pipeline loop with exponential back-off on Kafka connection failures."""
    print("🚀 ResCue AI Pipeline starting...")
    print(f"📡 Connecting to Aiven Kafka: {KAFKA_BOOTSTRAP}")
    print(f"📢 Listening to topics: {TOPICS}")

    retry_count = 0
    max_retries = 5

    while retry_count < max_retries:
        try:
            consumer = create_consumer(TOPICS)
            print("✅ Kafka consumer connected. Waiting for messages...")
            retry_count = 0  # Reset on success

            for msg in consumer:
                topic = msg.topic
                source = "reddit" if "reddit" in topic else "bluesky"
                try:
                    process_message(msg.value, source)
                    time.sleep(1)  # Rate limiting for Groq API
                except Exception as e:
                    print(f"❌ Message processing error: {e}")

        except KeyboardInterrupt:
            print("\n🛑 Pipeline stopped by user")
            break
        except Exception as e:
            retry_count += 1
            wait_time = min(30 * retry_count, 120)
            print(f"❌ Kafka connection error (attempt {retry_count}/{max_retries}): {e}")
            print(f"⏳ Retrying in {wait_time}s...")
            time.sleep(wait_time)

    print("🏁 Pipeline exited")


if __name__ == "__main__":
    run_pipeline()
