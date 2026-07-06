"""
BlueSky.py — ResCue AI Kafka Producer for BlueSky
Scrapes disaster posts from BlueSky and streams to Aiven Kafka.

Usage:
    python BlueSky.py
"""

import time
import json
import ssl
import os
from datetime import datetime
from atproto import Client
from kafka import KafkaProducer
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', 'backend', '.env'))

# ── Config ──────────────────────────────────────────────────────────────────
BLUESKY_USERNAME = os.getenv("BLUESKY_USERNAME", "sanid77.bsky.social")
BLUESKY_PASSWORD = os.getenv("BLUESKY_PASSWORD", "")

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka-1bbdb9d4-quiquietus-011.i.aivencloud.com:27060")
KAFKA_USERNAME = os.getenv("KAFKA_USERNAME", "avnadmin")
KAFKA_PASSWORD = os.getenv("KAFKA_PASSWORD", "")
KAFKA_CA_CERT = os.getenv("KAFKA_CA_CERT_PATH", os.path.join(os.path.dirname(__file__), '..', 'backend', 'ca.pem'))
KAFKA_TOPIC = "bluesky_disaster_posts"

SEARCH_QUERIES = ["wildfire", "flood", "earthquake", "hurricane", "disaster", "cyclone"]
BATCH_LIMIT = 25
SLEEP_BETWEEN_QUERIES = 5

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
        value_serializer=lambda v: json.dumps(v, default=str).encode("utf-8"),
        key_serializer=lambda k: str(k).encode("utf-8") if k else None,
        acks="all",
        retries=3,
    )
    print(f"✅ Connected to Aiven Kafka: {KAFKA_BOOTSTRAP}")
    return producer


def send_to_kafka(producer, data):
    key = data.get("CID", str(time.time()))
    try:
        future = producer.send(KAFKA_TOPIC, key=key, value=data)
        meta = future.get(timeout=10)
        print(f"  📤 Sent → topic={meta.topic} offset={meta.offset}")
        return True
    except Exception as e:
        print(f"  ❌ Kafka send failed: {e}")
        return False


def extract_images(post):
    images = {}
    try:
        img_list = post.embed.images
        for j, img in enumerate(img_list[:4], 1):
            images[f"Image{j}"] = str(img.thumb)
            images[f"Image{j}_Alt"] = img.alt or ""
    except Exception:
        try:
            images["Image1"] = str(post.embed.thumbnail)
            images["Image1_Alt"] = ""
        except Exception:
            pass
    return images


def scrape_bluesky():
    print("🦋 BlueSky scraper starting...")
    client = Client()
    profile = client.login(BLUESKY_USERNAME, BLUESKY_PASSWORD)
    print(f"✅ Logged in as: {profile.display_name}")

    producer = create_producer()
    total_sent = 0

    while True:
        for query in SEARCH_QUERIES:
            print(f"\n🔍 Searching BlueSky: '{query}'")
            try:
                resp = client.app.bsky.feed.search_posts({
                    "q": query,
                    "limit": BATCH_LIMIT,
                    "sort": "latest",
                })
                posts = resp.posts
                print(f"  Found {len(posts)} posts")

                # Fetch profile data
                handles = [p.author.handle for p in posts]
                pfp_map = {}
                if handles:
                    try:
                        pfp_raw = client.app.bsky.actor.get_profiles({"actors": handles})
                        pfp_map = {p.handle: p for p in pfp_raw.profiles}
                    except Exception as e:
                        print(f"  Profile fetch error: {e}")

                for post in posts:
                    handle = post.author.handle
                    pfp = pfp_map.get(handle)

                    data = {
                        "User_DID": post.author.did,
                        "User_Handle": handle,
                        "Username": post.author.display_name or handle,
                        "Account_Created_At": str(getattr(post.author, "created_at", "")),
                        "Followers": getattr(pfp, "followers_count", 0) if pfp else 0,
                        "Follows": getattr(pfp, "follows_count", 0) if pfp else 0,
                        "Post_Count": getattr(pfp, "posts_count", 0) if pfp else 0,
                        "User_Description": getattr(pfp, "description", "") if pfp else "",
                        "Created_At": str(post.record.created_at),
                        "Text": post.record.text,
                        "Likes": post.like_count or 0,
                        "Quotes": post.quote_count or 0,
                        "Reply_Count": post.reply_count or 0,
                        "Reposts": post.repost_count or 0,
                        "CID": post.cid,
                        "Query": query,
                        "Ingestion_Timestamp": datetime.now().isoformat(),
                        **extract_images(post),
                    }

                    if send_to_kafka(producer, data):
                        total_sent += 1
                        print(f"  ✅ {post.record.text[:60]}...")
                    time.sleep(0.5)

            except Exception as e:
                print(f"  Error searching '{query}': {e}")

            time.sleep(SLEEP_BETWEEN_QUERIES)

        producer.flush()
        print(f"\n✅ BlueSky round complete. Total sent: {total_sent}. Sleeping 120s...")
        time.sleep(120)


def main():
    scrape_bluesky()


if __name__ == "__main__":
    main()