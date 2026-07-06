<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11-3776AB?style=for-the-badge&logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/React-18.2-61DAFB?style=for-the-badge&logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/FastAPI-0.111-009688?style=for-the-badge&logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/PyTorch-2.2-EE4C2C?style=for-the-badge&logo=pytorch&logoColor=white" />
  <img src="https://img.shields.io/badge/Groq-Llama_3-FF6B00?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Apache_Kafka-Aiven-231F20?style=for-the-badge&logo=apachekafka&logoColor=white" />
  <img src="https://img.shields.io/badge/Firebase-Firestore-FFCA28?style=for-the-badge&logo=firebase&logoColor=black" />
</p>

<h1 align="center">🛟 ResCue AI</h1>
<h3 align="center">AI-Powered Real-Time Disaster Response & NGO Coordination Platform</h3>

<p align="center">
  <em>A full-stack application that monitors social media for disaster events in real time, classifies them through a multi-stage LLM pipeline, performs geospatial analysis using density-based clustering, and provides optimized relief routing — enabling NGOs to respond faster and save lives.</em>
</p>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [System Architecture](#-system-architecture)
- [Complete Data Flow](#-complete-data-flow)
- [AI/ML Pipeline — Technical Deep Dive](#-aiml-pipeline--technical-deep-dive)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [API Reference](#-api-reference)
- [Local Setup & Reproduction](#-local-setup--reproduction)
- [Deployment](#-deployment)
- [Limitations & Future Work](#-limitations--future-work)

---

## 🔍 Overview

ResCue AI addresses a critical gap in disaster response: **the time between a disaster occurring and NGOs receiving actionable intelligence**. Traditional systems rely on manual reporting and centralized news — often delaying response by hours.

This platform solves that by:

1. **Ingesting disaster signals from social media** (Reddit & BlueSky) via Apache Kafka streaming
2. **Classifying and enriching them through a 4-stage Llama 3 AI pipeline** with news context augmentation
3. **Enabling victims to report incidents** with GPS-tagged disaster images classified by a fine-tuned ResNet50 CNN
4. **Providing NGO coordinators with geospatial intelligence** — DBSCAN-optimized relief center placement and shortest-path route networks

### Key Highlights

| Capability | Technical Implementation |
|---|---|
| **Real-time social media monitoring** | Apache Kafka (Aiven) producers on Reddit (PRAW) and BlueSky (AT Protocol), consuming across 2 topics |
| **Multi-stage AI classification** | 4 sequential Groq/Llama 3 8B inference calls: informative filter → disaster category → severity → enriched summary |
| **Image-based disaster detection** | Fine-tuned ResNet50 (9-class) with confidence-based severity thresholding |
| **Geospatial clustering** | DBSCAN with haversine metric for density-based relief center placement |
| **Route optimization** | Google Maps Directions API for shortest-path computation from relief centers to victims |
| **Keyword extraction & news enrichment** | YAKE (unsupervised statistical) + NewsAPI for contextual augmentation |
| **Real-time frontend updates** | Firebase Firestore `onSnapshot` listeners for instant UI propagation |
| **Deduplication** | MD5 hash-based message deduplication across the pipeline |

---

## 🏗 System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              DATA INGESTION LAYER                              │
│                                                                                 │
│   ┌──────────────┐          ┌──────────────────────────────┐                   │
│   │   Reddit      │─────────▶│                              │                   │
│   │   (PRAW API)  │  Kafka   │     Apache Kafka (Aiven)     │                   │
│   │   8 subreddits│  Topic:  │     SASL_SSL + SCRAM-SHA-256 │                   │
│   └──────────────┘  reddit_  │                              │                   │
│                     disasters│   Topics:                     │                   │
│   ┌──────────────┐          │   • reddit_disasters          │                   │
│   │   BlueSky     │─────────▶│   • bluesky_disaster_posts   │                   │
│   │   (AT Proto)  │  Kafka   │                              │                   │
│   │   6 queries   │  Topic:  └──────────┬───────────────────┘                   │
│   └──────────────┘  bluesky_            │                                       │
│                     disaster_           │ Consumer Group:                        │
│                     posts               │ rescue-ai-pipeline                    │
└─────────────────────────────────────────┼───────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           AI PROCESSING PIPELINE                               │
│                                                                                 │
│   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐             │
│   │  STAGE 1 (M1)   │   │  STAGE 2 (M2)   │   │  STAGE 3 (M3)   │             │
│   │  Informative    │──▶│  Disaster Type   │──▶│  Severity        │             │
│   │  Filter         │   │  Classification  │   │  Assessment      │             │
│   │  (Llama 3 8B)   │   │  (Llama 3 8B)   │   │  (Llama 3 8B)   │             │
│   │  YES/NO         │   │  9 categories    │   │  HIGH/MED/LOW   │             │
│   └─────────────────┘   └─────────────────┘   └────────┬────────┘             │
│                                                          │                      │
│   ┌─────────────────┐   ┌─────────────────┐            │                      │
│   │  YAKE Keywords  │──▶│  NewsAPI Context │            │                      │
│   │  (Statistical   │   │  Enrichment      │            │                      │
│   │   Extraction)   │   │  (Top article)   │            │                      │
│   └─────────────────┘   └────────┬────────┘            │                      │
│                                   │                      │                      │
│                                   ▼                      ▼                      │
│                          ┌─────────────────────────────────┐                   │
│                          │  STAGE 4 — Final Enrichment     │                   │
│                          │  (Llama 3 8B)                   │                   │
│                          │  Generates:                     │                   │
│                          │  • Summary (2-3 sentences)      │                   │
│                          │  • Precise location extraction  │                   │
│                          │  • Casualty information         │                   │
│                          │  • NGO response strategy        │                   │
│                          └──────────────┬──────────────────┘                   │
│                                         │                                       │
└─────────────────────────────────────────┼───────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              DATA PERSISTENCE                                  │
│                                                                                 │
│                    ┌────────────────────────────────┐                           │
│                    │   Google Cloud Firestore        │                           │
│                    │   Collection: disaster_reports  │                           │
│                    │   Real-time onSnapshot listener │                           │
│                    └──────────────┬─────────────────┘                           │
│                                   │                                              │
└───────────────────────────────────┼──────────────────────────────────────────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          ▼                         ▼                         ▼
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────────┐
│  🌍 Global Feed   │   │  🚨 Victim Portal │   │  🏥 NGO Dashboard     │
│  (React)          │   │  (React)          │   │  (React)              │
│                   │   │                   │   │                       │
│  • Live disaster  │   │  • GPS auto-detect│   │  Step 1: View         │
│    cards          │   │  • Image upload   │   │    incidents          │
│  • Category       │   │  • ResNet50 CNN   │   │  Step 2: DBSCAN       │
│    filtering      │   │    classification │   │    clustering →       │
│  • Search by      │   │  • Severity map   │   │    relief centers     │
│    location       │   │    markers        │   │  Step 3: Shortest-    │
│  • AI summaries   │   │                   │   │    path routing       │
│  • NGO strategy   │   │                   │   │                       │
└──────────────────┘   └──────────────────┘   └──────────────────────┘
```

---

## 🔄 Complete Data Flow

### Phase 1 — Data Ingestion (Kafka Producers)

Two independent Python producers continuously scrape social media:

**Reddit Producer** (`OnlyReddit/Reddit.py`):
- Monitors **8 subreddits**: `disaster`, `news`, `wildfire`, `earthquake`, `storm`, `worldnews`, `Weather`, `floods`
- Scrapes both `hot` posts and keyword-searched `new` posts using PRAW (Python Reddit API Wrapper)
- Downloads attached images for potential visual analysis
- Serializes each post as JSON and publishes to the `reddit_disasters` Kafka topic
- Produces with `acks=all` for guaranteed delivery

**BlueSky Producer** (`OnlyBlueSky/BlueSky.py`):
- Authenticates via the AT Protocol (Authenticated Transfer Protocol)
- Searches across **6 disaster-related queries**: `wildfire`, `flood`, `earthquake`, `hurricane`, `disaster`, `cyclone`
- Extracts author metadata (followers, post count, account age) for credibility signals
- Publishes to the `bluesky_disaster_posts` Kafka topic

**Kafka Configuration**:
- Broker: Aiven managed Kafka cluster
- Security: `SASL_SSL` protocol with `SCRAM-SHA-256` authentication
- Consumer group: `rescue-ai-pipeline` with auto-offset reset to `earliest`
- Serialization: JSON with UTF-8 encoding

### Phase 2 — AI Processing Pipeline (`backend/pipeline.py`)

Each consumed message passes through a **4-stage sequential AI pipeline**:

| Stage | Model | Task | Input → Output |
|-------|-------|------|-----------------|
| **M1** | Llama 3 8B (Groq) | Informative Filter | Post title → `YES`/`NO` (is this a real disaster event?) |
| **M2** | Llama 3 8B (Groq) | Disaster Classification | Post title → One of 9 categories: `Flood`, `Fire`, `Earthquake`, `Storm`, `Drought`, `Landslide`, `Tsunami`, `Cyclone`, `Other` |
| **M3** | Llama 3 8B (Groq) | Severity Assessment | Post title → `HIGH` / `MEDIUM` / `LOW` |
| **M4** | Llama 3 8B (Groq) | Enriched Summary Generation | Post + news context → JSON: `{summary, location, casualties, strategy}` |

**Between M3 and M4**, two enrichment steps occur:

- **YAKE Keyword Extraction**: Unsupervised statistical keyword extraction (language=`en`, n-gram=1, dedup threshold=0.7, top 5 keywords) identifies key terms from the post
- **NewsAPI Context Augmentation**: The extracted keywords are used to query the NewsAPI for the latest relevant news article, providing ground-truth context for the final enrichment stage

**Deduplication**: Each post is assigned an MD5 hash of its title. A runtime set tracks processed hashes, preventing duplicate processing within the same pipeline session.

**Output**: The enriched document is written to the `disaster_reports` collection in Google Cloud Firestore with fields including: `title`, `summary`, `Label`, `Severity`, `Location`, `Strategy`, `injured_or_dead_people`, `keywords`, `source`, `timestamp`.

### Phase 3 — Image-Based Classification (`POST /classify`)

Victims can upload disaster images through the frontend:

- **Model**: ResNet50 (pretrained on ImageNet, fine-tuned on disaster imagery)
- **Input**: 224×224 RGB image (normalized with ImageNet mean/std)
- **Classes** (9 total):

  | Class | Type |
  |-------|------|
  | `Infrastructure` | Disaster |
  | `Urban_Fire` | Disaster |
  | `Wild_Fire` | Disaster |
  | `Human_Damage` | Disaster |
  | `Drought` | Disaster |
  | `Land_Slide` | Disaster |
  | `Non_Damage_Buildings_Street` | Non-Disaster |
  | `Non_Damage_Wildlife_Forest` | Non-Disaster |
  | `human` | Non-Disaster |

- **Severity Thresholding**: If the predicted class is a disaster class and `confidence > 0.6`, the incident is classified as `severe`; otherwise `non-severe`
- **Non-Disaster Filtering**: Posts classified into the 3 non-disaster classes are filtered out and not displayed on the map

### Phase 4 — Geospatial Analysis (NGO Dashboard)

The NGO Dashboard provides a 3-step analytical workflow:

**Step 1 — Incident Visualization**: All reported disaster points are plotted on a dark-themed Google Map with color-coded severity markers (red = high, blue = non-severe).

**Step 2 — DBSCAN Clustering for Relief Center Placement**:
- **Algorithm**: DBSCAN (Density-Based Spatial Clustering of Applications with Noise)
- **Parameters**:
  - `eps = 0.03` (maximum distance between two samples in radians, ~3.3 km)
  - `min_samples = 5` (minimum points required to form a dense cluster)
  - `metric = haversine` (great-circle distance on Earth's surface)
- **Why DBSCAN over K-Means**: DBSCAN was chosen because it does not require specifying the number of clusters `k` in advance (critical when the number of disaster zones is unknown), it identifies noise points (outliers) that don't belong to any cluster, and it handles arbitrarily shaped clusters — unlike K-Means which assumes spherical clusters
- **Relief Center Placement**: The centroid of each identified cluster becomes the optimal location for a relief center. Each center includes metadata: point count, severe case count

**Step 3 — Shortest Path Routing**:
- For each relief center, shortest paths are computed to every victim point within its cluster
- **Routing Engine**: Google Maps Directions API (`mode=driving`, with real-time `departure_time`)
- The API returns encoded polylines that are decoded and rendered as route networks on the map
- Routes for severe cases are rendered with thicker stroke weight (4px vs 2.5px) for visual priority
- Each cluster's routes are color-coded to match the DBSCAN cluster visualization
- **Fallback**: When the Maps API is unavailable, straight-line paths (great-circle) are rendered as fallback

---

## 🛠 Tech Stack

### Backend
| Technology | Purpose |
|---|---|
| **FastAPI** | High-performance async REST API framework |
| **PyTorch + torchvision** | ResNet50 model inference |
| **scikit-learn** | DBSCAN clustering with haversine metric |
| **Groq SDK** | Ultra-fast Llama 3 8B inference (4 pipeline stages) |
| **kafka-python** | Apache Kafka producer/consumer client |
| **Firebase Admin SDK** | Server-side Firestore read/write |
| **YAKE** | Unsupervised keyword extraction |
| **googlemaps** | Directions API for route optimization |
| **PRAW** | Reddit API wrapper |
| **atproto** | BlueSky AT Protocol client |
| **pandas + NumPy** | Geospatial data manipulation |
| **matplotlib** | Cluster colormap generation |

### Frontend
| Technology | Purpose |
|---|---|
| **React 18** | Component-based UI with hooks |
| **React Router v6** | Client-side routing (`/`, `/help`, `/ngo`) |
| **@react-google-maps/api** | Google Maps integration (markers, circles, polylines, info windows) |
| **Firebase JS SDK** | Real-time Firestore `onSnapshot` listeners |
| **Axios** | HTTP client for backend API calls |

### Infrastructure
| Technology | Purpose |
|---|---|
| **Apache Kafka (Aiven)** | Managed event streaming with SASL_SSL + SCRAM-SHA-256 |
| **Google Cloud Firestore** | Real-time NoSQL database |
| **Render** | Cloud deployment (3 services: API + Worker + Static) |

---

## 📁 Project Structure

```
ResCue-AI/
│
├── backend/
│   ├── main.py                  # FastAPI server: /classify, /disaster-points,
│   │                            #   /clustered-points, /colormap, /relief-centers,
│   │                            #   /shortest-paths, /social-feed
│   ├── pipeline.py              # Kafka consumer + 4-stage Llama 3 AI pipeline
│   ├── requirements.txt         # Python dependencies (19 packages)
│   └── ngo_back.py              # Legacy standalone NGO backend (merged into main.py)
│
├── frontend/
│   ├── src/
│   │   ├── App.js               # Router: 3 routes with Navbar
│   │   ├── App.css              # Global styles (Inter font, dark theme)
│   │   ├── Components/
│   │   │   ├── Home.js          # Live disaster feed with search & filters
│   │   │   ├── DisasterCard.js  # AI-enriched disaster event cards
│   │   │   ├── UserForm.js      # Victim portal: GPS + image upload + map
│   │   │   ├── Ngo.js           # NGO dashboard: 3-step workflow
│   │   │   └── Navbar.js        # Glassmorphism navigation bar
│   │   └── firebase/
│   │       └── firebaseConfig.js
│   └── public/
│       └── index.html
│
├── OnlyReddit/
│   └── Reddit.py                # Reddit → Kafka producer (8 subreddits)
│
├── OnlyBlueSky/
│   └── BlueSky.py               # BlueSky → Kafka producer (6 queries)
│
├── resnet50_disaster.pth        # Fine-tuned ResNet50 weights (94 MB, 9 classes)
├── render.yaml                  # Render deployment blueprint (3 services)
├── .gitignore
└── README.md
```

---

## 📡 API Reference

All endpoints served by `backend/main.py` on port `8001`:

| Method | Endpoint | Description | Response |
|--------|----------|-------------|----------|
| `GET` | `/` | Health check | `{"status": "healthy", "version": "1.0.0"}` |
| `POST` | `/classify` | Upload disaster image with GPS coords → ResNet50 classification | `{display, label, confidence, classification, lat, lng}` |
| `GET` | `/disaster-points` | All disaster points with severity labels | Array of `{lat, lon, severity}` |
| `GET` | `/clustered-points` | Disaster points with DBSCAN cluster assignments | Array of `{lat, lon, severity, cluster}` |
| `GET` | `/colormap` | Cluster ID → hex color mapping | `{0: "#1f77b4", 1: "#ff7f0e", ...}` |
| `GET` | `/relief-centers` | Optimal relief center locations (cluster centroids) | Array of `{lat, lon, dbscan_cluster, point_count, severe_count}` |
| `GET` | `/shortest-paths` | Shortest driving routes from each center to its cluster's victims | Nested dict of polyline paths |
| `GET` | `/social-feed?limit=20` | AI-enriched disaster feed from Firestore (mock fallback) | Array of enriched disaster documents |
| `GET` | `/docs` | Interactive Swagger API documentation | Swagger UI |

---

## 🚀 Local Setup & Reproduction

### Prerequisites

- **Python 3.10+**
- **Node.js 18+**
- **Aiven Kafka cluster** with topics `reddit_disasters` and `bluesky_disaster_posts`
- **Firebase project** with Firestore enabled
- API keys for: Groq, NewsAPI, Reddit, BlueSky

### Step 1 — Clone & Configure

```bash
git clone https://github.com/quiquietus/ResCue-AI.git
cd ResCue-AI
```

Create `backend/.env`:
```env
GROQ_API_KEY=your_groq_api_key
NEWS_API_KEY=your_newsapi_key
GOOGLE_MAPS_API_KEY=your_google_maps_key

KAFKA_BOOTSTRAP_SERVERS=your-kafka-cluster.aivencloud.com:27060
KAFKA_USERNAME=avnadmin
KAFKA_PASSWORD=your_kafka_password
KAFKA_CA_CERT_PATH=./ca.pem

FIREBASE_CREDENTIALS_PATH=./firebase-service-account.json

REDDIT_CLIENT_ID=your_reddit_client_id
REDDIT_CLIENT_SECRET=your_reddit_client_secret
REDDIT_USER_AGENT=DisasterScraper:v1.0

BLUESKY_USERNAME=your.handle.bsky.social
BLUESKY_PASSWORD=your_app_password

MODEL_PATH=../resnet50_disaster.pth
CORS_ORIGINS=http://localhost:3000
PORT=8001
```

Create `frontend/.env`:
```env
REACT_APP_BACKEND_URL=http://localhost:8001
REACT_APP_GOOGLE_MAPS_KEY=your_google_maps_key
```

### Step 2 — Firebase & Kafka Certificates

1. **Firebase**: Go to [Firebase Console](https://console.firebase.google.com) → Project Settings → Service Accounts → Generate new private key → save as `backend/firebase-service-account.json`
2. **Aiven CA cert**: Go to [Aiven Console](https://console.aiven.io) → Your Kafka service → Download CA Certificate → save as `backend/ca.pem`

### Step 3 — Install & Run Backend

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

Verify: http://localhost:8001/docs (Swagger UI)

### Step 4 — Install & Run Frontend

```bash
cd frontend
npm install
npm start
```

Verify: http://localhost:3000

### Step 5 — Run AI Pipeline (optional — needs Kafka + Firebase)

```bash
cd backend
python pipeline.py
```

### Step 6 — Run Scrapers (optional — needs Reddit/BlueSky + Kafka)

```bash
# Terminal 1
cd OnlyReddit && python Reddit.py

# Terminal 2
cd OnlyBlueSky && python BlueSky.py
```

> **Note**: The app works fully without Steps 5–6. The backend serves rich mock disaster data, and the frontend displays it. The pipeline and scrapers are needed only for live social media monitoring.

---

## ☁️ Deployment

The project includes a `render.yaml` blueprint for one-click deployment to [Render](https://render.com):

| Service | Type | Description |
|---------|------|-------------|
| `rescue-ai-backend` | Web Service (Python) | FastAPI API server |
| `rescue-ai-pipeline` | Background Worker | Kafka consumer + AI pipeline |
| `rescue-ai-frontend` | Static Site | React production build |

**Deploy**: Push to GitHub → Render Dashboard → New Blueprint → Connect repo → Environment variables will be prompted.

---

## ⚠️ Limitations & Future Work

### Current Limitations

| Limitation | Details |
|---|---|
| **Google Maps API** | Route optimization on the NGO Dashboard requires a Google Maps API key with billing enabled. Without it, the map renders but routes fall back to straight-line paths. The Maps API was not activated due to payment requirements. |
| **Model retraining** | The ResNet50 model is pre-trained on a specific disaster imagery dataset. It may not generalize well to disaster types or geographies not represented in the training data. |
| **Groq API rate limits** | The free tier of Groq has rate limits. Under high message throughput, the pipeline may need throttling (currently rate-limited to 1 second between messages). |
| **Single-session dedup** | The MD5-based deduplication only persists in memory during a single pipeline session. Restarting the pipeline may reprocess previously seen messages. |
| **Kafka consumer lag** | The `consumer_timeout_ms=60000` setting means the consumer will exit after 60 seconds of no new messages. The pipeline auto-restarts with exponential backoff (max 5 retries). |

### Future Enhancements

- **Persistent deduplication** using Redis or Firestore for cross-session message tracking
- **Multi-language support** for Llama 3 classification (currently English-only)
- **Satellite imagery integration** for real-time disaster area mapping
- **Push notifications** to NGO field teams via Firebase Cloud Messaging
- **Historical analytics dashboard** with trend visualization and response time metrics
- **Automated resource allocation** using linear programming to optimize relief supply distribution
- **Credibility scoring** for social media posts using author metadata (follower count, account age)

---

## 📄 License

This project is for educational and portfolio purposes.

---

<p align="center">
  <strong>Built with ❤️ for disaster response</strong>
  <br />
  <em>Full-Stack AI · Real-Time Streaming · Geospatial Intelligence</em>
</p>
