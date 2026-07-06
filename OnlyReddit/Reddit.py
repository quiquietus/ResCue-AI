"""
Reddit.py — ResCue AI Kafka Producer for Reddit
Scrapes disaster-related posts and streams them to Aiven Kafka.

Usage:
    python Reddit.py
"""

import praw
import time
import json
import ssl
import os
import re
import urllib.parse
import requests
import mimetypes
from kafka import KafkaProducer
from datetime import datetime
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', 'backend', '.env'))

# ── Config ──────────────────────────────────────────────────────────────────
REDDIT_CLIENT_ID = os.getenv("REDDIT_CLIENT_ID", "PLsQVvzm4DNB-0No0AH7xA")
REDDIT_CLIENT_SECRET = os.getenv("REDDIT_CLIENT_SECRET", "wucpYFEvaQ5aga44Ryqo8yKipVVBvA")
REDDIT_USER_AGENT = os.getenv("REDDIT_USER_AGENT", "Disaster Scraper:v1.0")

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka-1bbdb9d4-quiquietus-011.i.aivencloud.com:27060")
KAFKA_USERNAME = os.getenv("KAFKA_USERNAME", "avnadmin")
KAFKA_PASSWORD = os.getenv("KAFKA_PASSWORD", "")
KAFKA_CA_CERT = os.getenv("KAFKA_CA_CERT_PATH", os.path.join(os.path.dirname(__file__), '..', 'backend', 'ca.pem'))
KAFKA_TOPIC = "reddit_disasters"

IMAGE_DIR = os.path.join(os.path.dirname(__file__), "reddit_images")
os.makedirs(IMAGE_DIR, exist_ok=True)

SUBREDDITS = ["disaster", "news", "wildfire", "earthquake", "storm", "worldnews", "Weather", "floods"]
QUERY = "disaster OR wildfire OR flood OR earthquake OR hurricane OR cyclone"
IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}
NUM_POSTS = 50

# ── Aiven Kafka Producer ─────────────────────────────────────────────────────
def create_producer():
    ssl_context = ssl.create_default_context()
    if os.path.exists(KAFKA_CA_CERT):
        ssl_context = ssl.create_default_context(cafile=KAFKA_CA_CERT)
        print(f"✅ CA cert loaded: {KAFKA_CA_CERT}")
    else:
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        print("⚠️  CA cert not found — SSL verification disabled")

    producer = KafkaProducer(
        bootstrap_servers=KAFKA_BOOTSTRAP,
        security_protocol="SASL_SSL",
        sasl_mechanism="SCRAM-SHA-256",
        sasl_plain_username=KAFKA_USERNAME,
        sasl_plain_password=KAFKA_PASSWORD,
        ssl_context=ssl_context,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        key_serializer=lambda k: k.encode("utf-8") if isinstance(k, str) else None,
        acks="all",
        retries=3,
    )
    print(f"✅ Connected to Aiven Kafka: {KAFKA_BOOTSTRAP}")
    return producer


def is_image_url(url):
    ext = os.path.splitext(urllib.parse.urlparse(url).path)[1].lower()
    return ext in IMAGE_EXTS


def download_image(url, post_id):
    try:
        resp = requests.get(url, stream=True, timeout=10)
        if resp.status_code != 200:
            return None
        content_type = resp.headers.get("Content-Type", "")
        ext = mimetypes.guess_extension(content_type) or os.path.splitext(urllib.parse.urlparse(url).path)[1]
        if not ext or ext not in IMAGE_EXTS:
            ext = ".jpg"
        path = os.path.join(IMAGE_DIR, f"{post_id}{ext}")
        with open(path, "wb") as f:
            for chunk in resp.iter_content(1024):
                f.write(chunk)
        return path
    except Exception as e:
        print(f"Image download error: {e}")
        return None


def send_to_kafka(producer, data):
    key = f"{data.get('subreddit', 'reddit')}-{data.get('id', time.time())}"
    try:
        future = producer.send(KAFKA_TOPIC, key=key, value=data)
        meta = future.get(timeout=10)
        print(f"  📤 Sent → topic={meta.topic} partition={meta.partition} offset={meta.offset}")
        return True
    except Exception as e:
        print(f"  ❌ Kafka send failed: {e}")
        return False


def scrape_and_stream():
    producer = create_producer()
    reddit = praw.Reddit(
        client_id=REDDIT_CLIENT_ID,
        client_secret=REDDIT_CLIENT_SECRET,
        user_agent=REDDIT_USER_AGENT,
        check_for_async=False,
        read_only=True,
    )
    print(f"🔴 Reddit scraper ready | Watching: {SUBREDDITS}")

    while True:
        total = 0
        for sub_name in SUBREDDITS:
            try:
                sub = reddit.subreddit(sub_name)
                print(f"\n📋 Scraping r/{sub_name}...")

                for method, posts in [("hot", sub.hot(limit=NUM_POSTS)), ("new", sub.search(QUERY, limit=NUM_POSTS, sort="new"))]:
                    for post in posts:
                        image_path = None
                        if is_image_url(post.url):
                            image_path = download_image(post.url, post.id)

                        data = {
                            "id": post.id,
                            "title": post.title,
                            "url": post.url,
                            "selftext": post.selftext[:500] if post.selftext else "",
                            "created_utc": post.created_utc,
                            "upvotes": post.score,
                            "num_comments": post.num_comments,
                            "subreddit": post.subreddit.display_name,
                            "method": method,
                            "timestamp": datetime.now().isoformat(),
                            "image_path": image_path or "",
                        }
                        if send_to_kafka(producer, data):
                            total += 1
                            print(f"  ✅ {method}: {post.title[:50]}...")
                        time.sleep(0.5)

            except Exception as e:
                print(f"Error scraping r/{sub_name}: {e}")

        producer.flush()
        print(f"\n✅ Scrape complete. Sent {total} posts. Sleeping 60s...")
        time.sleep(60)


if __name__ == "__main__":
    scrape_and_stream()
