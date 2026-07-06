"""
main.py — ResCue AI FastAPI Backend

Unified API server providing:
  - ResNet50 image classification endpoint (/classify)
  - NGO Dashboard endpoints (disaster-points, clustered-points, colormap, relief-centers, shortest-paths)
  - Social feed from Firestore with mock fallback (/social-feed)

Usage:
    uvicorn main:app --host 0.0.0.0 --port 8001 --reload
"""

import os
import io
import json
from datetime import datetime
from typing import Optional, List

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import torch
import torchvision.transforms as transforms
import torchvision.models as models
import torch.nn.functional as F
from PIL import Image
import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN
import matplotlib
matplotlib.use('Agg')
import matplotlib.cm as cm
import matplotlib.colors as mcolors
import googlemaps
import polyline as polyline_lib
from dotenv import load_dotenv

load_dotenv()

# ── Firebase ────────────────────────────────────────────────────────────────
try:
    import firebase_admin
    from firebase_admin import credentials, firestore as fs
    FIREBASE_CREDS = os.getenv("FIREBASE_CREDENTIALS_PATH", "./firebase-service-account.json")
    if os.path.exists(FIREBASE_CREDS):
        cred = credentials.Certificate(FIREBASE_CREDS)
        firebase_admin.initialize_app(cred)
        db = fs.client()
        print("[OK] Firebase Admin initialized")
    else:
        db = None
        print("[WARN] Firebase credentials not found -- using mock feed data")
except Exception as e:
    db = None
    print(f"[WARN] Firebase init failed: {e}")

# ── App ─────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="ResCue AI API",
    description="AI-powered disaster response coordination platform",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,https://rescue-ai-frontend.onrender.com"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in CORS_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── ResNet50 Image Classifier ────────────────────────────────────────────────
MODEL_PATH = os.getenv(
    "MODEL_PATH",
    os.path.join(os.path.dirname(__file__), "..", "resnet50_disaster.pth")
)
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

CLASS_TO_IDX = {
    "Infrastructure": 0,
    "Urban_Fire": 1,
    "Wild_Fire": 2,
    "Human_Damage": 3,
    "Drought": 4,
    "Land_Slide": 5,
    "Non_Damage_Buildings_Street": 6,
    "Non_Damage_Wildlife_Forest": 7,
    "human": 8,
}
IDX_TO_CLASS = {v: k for k, v in CLASS_TO_IDX.items()}
NON_DISASTER_CLASSES = {"Non_Damage_Buildings_Street", "Non_Damage_Wildlife_Forest", "human"}

_resnet: Optional[models.ResNet] = None


def get_resnet():
    global _resnet
    if _resnet is not None:
        return _resnet
    try:
        m = models.resnet50(weights=None)
        m.fc = torch.nn.Linear(m.fc.in_features, len(CLASS_TO_IDX))
        m.load_state_dict(torch.load(MODEL_PATH, map_location=device))
        m.to(device)
        m.eval()
        _resnet = m
        print(f"[OK] ResNet50 loaded from {MODEL_PATH}")
    except Exception as e:
        print(f"[WARN] ResNet50 load failed: {e}")
    return _resnet


_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])


def classify_bytes(image_bytes: bytes):
    model = get_resnet()
    if model is None:
        raise RuntimeError("ResNet50 model not available")
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    tensor = _transform(img).unsqueeze(0).to(device)
    with torch.no_grad():
        out = model(tensor)
        probs = F.softmax(out, dim=1)
        conf, pred = torch.max(probs, 1)
    return IDX_TO_CLASS[pred.item()], conf.item()


@app.post("/classify", summary="Classify disaster image")
async def classify_api(
    latitude: float = Form(...),
    longitude: float = Form(...),
    image: UploadFile = File(...),
):
    """Upload an image with GPS coordinates; returns severity classification."""
    image_bytes = await image.read()
    try:
        label, confidence = classify_bytes(image_bytes)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Image processing error: {e}")

    if label in NON_DISASTER_CLASSES:
        return {"display": False, "label": label, "confidence": round(confidence, 4)}

    severity = "severe" if confidence > 0.6 else "non-severe"
    return {
        "display": True,
        "latitude": latitude,
        "longitude": longitude,
        "classification": severity,
        "confidence": round(confidence, 4),
        "label": label,
    }


# ── NGO Dashboard — DBSCAN + Routing ────────────────────────────────────────
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")
_gmaps = googlemaps.Client(key=GOOGLE_MAPS_API_KEY) if GOOGLE_MAPS_API_KEY else None

# Sample disaster point data (seeded for consistency)
np.random.seed(42)
_coords = np.random.uniform(low=[28.50, 77.00], high=[28.80, 77.30], size=(100, 2))
_sevs = np.random.choice(["high", "low"], size=100, p=[0.3, 0.7])
_df = pd.DataFrame(_coords, columns=["lat", "lon"])
_df["severity"] = _sevs

_dbscan = DBSCAN(eps=0.03, min_samples=5, metric="haversine").fit(
    np.radians(_df[["lat", "lon"]].to_numpy())
)
_df["cluster"] = _dbscan.labels_


def _build_colormap():
    unique_clusters = sorted(c for c in _df["cluster"].unique() if c != -1)
    n = max(len(unique_clusters), 1)
    cmap = cm.get_cmap("tab10", n)
    norm = mcolors.Normalize(vmin=0, vmax=n - 1)
    result = {int(c): mcolors.rgb2hex(cmap(norm(i))) for i, c in enumerate(unique_clusters)}
    result[-1] = "#555555"
    return result


_colormap_cache = None


@app.get("/", summary="Health check")
def root():
    return {"message": "ResCue AI Backend is running", "version": "1.0.0", "status": "healthy"}


@app.get("/disaster-points", summary="All disaster points with severity")
def get_disaster_points():
    return _df[["lat", "lon", "severity"]].to_dict(orient="records")


@app.get("/clustered-points", summary="Disaster points with DBSCAN cluster IDs")
def get_clustered_points():
    return _df[["lat", "lon", "severity", "cluster"]].to_dict(orient="records")


@app.get("/colormap", summary="Cluster ID to hex color mapping")
def get_colormap():
    global _colormap_cache
    if _colormap_cache is None:
        _colormap_cache = _build_colormap()
    return _colormap_cache


@app.get("/relief-centers", summary="Optimal relief center locations (cluster centroids)")
def get_relief_centers():
    centers = []
    for cluster_id in sorted(c for c in _df["cluster"].unique() if c != -1):
        sub = _df[_df["cluster"] == cluster_id]
        centers.append({
            "lat": float(sub["lat"].mean()),
            "lon": float(sub["lon"].mean()),
            "dbscan_cluster": int(cluster_id),
            "point_count": int(len(sub)),
            "severe_count": int((sub["severity"] == "high").sum()),
        })
    return centers


@app.get("/shortest-paths", summary="Shortest paths from relief centers to cluster victims")
def get_shortest_paths():
    centers = get_relief_centers()
    result = {}

    for center in centers:
        cid = center["dbscan_cluster"]
        cluster_pts = _df[_df["cluster"] == cid]
        paths = []

        for _, pt in cluster_pts.iterrows():
            path = [[center["lat"], center["lon"]], [float(pt["lat"]), float(pt["lon"])]]

            if _gmaps:
                try:
                    dirs = _gmaps.directions(
                        origin=(center["lat"], center["lon"]),
                        destination=(float(pt["lat"]), float(pt["lon"])),
                        mode="driving",
                        departure_time=datetime.now(),
                    )
                    if dirs:
                        encoded = dirs[0]["overview_polyline"]["points"]
                        path = polyline_lib.decode(encoded)
                except Exception as e:
                    print(f"Maps API error for cluster {cid}: {e}")

            paths.append({
                "point_id": int(pt.name),
                "point": [float(pt["lat"]), float(pt["lon"])],
                "severity": pt["severity"],
                "path": path,
            })

        result[cid] = paths

    return result


# ── Social Feed from Firestore ───────────────────────────────────────────────
MOCK_FEED = [
    {
        "id": "mock_001",
        "title": "Severe flooding reported in coastal Maharashtra",
        "summary": "Multiple neighborhoods have been submerged following three days of intense rainfall. The IMD has issued a red alert for coastal districts.",
        "Label": "Flood",
        "Severity": "high",
        "Location": "Mumbai, Maharashtra, India",
        "Strategy": "Evacuate low-lying areas immediately. Deploy NDRF teams to Thane and Raigad districts. Set up relief camps at elevated public schools.",
        "source": "reddit",
        "injured_or_dead_people": "12 reported missing",
        "timestamp": {"seconds": int(datetime.now().timestamp()) - 1800, "nanoseconds": 0},
        "url": "https://reddit.com/r/india",
        "category": "flood",
        "severity": "Critical",
    },
    {
        "id": "mock_002",
        "title": "California wildfire forces mass evacuation",
        "summary": "A fast-moving wildfire driven by strong Santa Ana winds has burned through 5,000 acres and forced evacuation orders for 15,000 residents.",
        "Label": "Wild_Fire",
        "Severity": "high",
        "Location": "San Bernardino County, California, USA",
        "Strategy": "Deploy aerial tankers and ground crews. Establish firebreaks along the eastern perimeter. Coordinate with CalFire for containment.",
        "source": "bluesky",
        "injured_or_dead_people": "3 firefighters injured",
        "timestamp": {"seconds": int(datetime.now().timestamp()) - 7200, "nanoseconds": 0},
        "url": "https://bsky.app",
        "category": "fire",
        "severity": "Critical",
    },
    {
        "id": "mock_003",
        "title": "6.2 magnitude earthquake strikes Nepal-Tibet border",
        "summary": "A moderate earthquake caused structural damage to several villages in the Humla district. Rescue teams have been deployed to assess casualties.",
        "Label": "Earthquake",
        "Severity": "medium",
        "Location": "Humla District, Nepal",
        "Strategy": "Send search and rescue teams with rubble detection equipment. Establish field hospitals. Aerial survey for road blockages.",
        "source": "reddit",
        "injured_or_dead_people": "47 injured, 8 fatalities",
        "timestamp": {"seconds": int(datetime.now().timestamp()) - 14400, "nanoseconds": 0},
        "url": "https://reddit.com/r/worldnews",
        "category": "earthquake",
        "severity": "High",
    },
    {
        "id": "mock_004",
        "title": "Cyclone warning issued for Andhra Pradesh coast",
        "summary": "IMD has issued a cyclone warning as a deep depression in the Bay of Bengal intensifies. Coastal communities are urged to evacuate to designated shelters.",
        "Label": "Storm",
        "Severity": "high",
        "Location": "Visakhapatnam, Andhra Pradesh, India",
        "Strategy": "Pre-position relief supplies at 50km inland staging areas. Coordinate with state disaster management for mandatory coastal evacuation.",
        "source": "bluesky",
        "injured_or_dead_people": "No casualties yet",
        "timestamp": {"seconds": int(datetime.now().timestamp()) - 3600, "nanoseconds": 0},
        "url": "https://bsky.app",
        "category": "storm",
        "severity": "Critical",
    },
]


@app.get("/social-feed", summary="Enriched disaster feed from Firestore")
def get_social_feed(limit: int = 20):
    """Returns AI-enriched disaster posts. Falls back to mock data if Firebase unavailable."""
    if db is not None:
        try:
            docs = (
                db.collection("disaster_reports")
                .order_by("timestamp", direction=fs.Query.DESCENDING)
                .limit(limit)
                .stream()
            )
            results = [{"id": doc.id, **doc.to_dict()} for doc in docs]
            if results:
                return results
        except Exception as e:
            print(f"[WARN] Firestore read error: {e}")
    return MOCK_FEED


# ── Startup ──────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    print("[STARTUP] ResCue AI Backend starting up...")
    get_resnet()  # Pre-load ResNet50 at startup
    get_colormap()  # Pre-compute colormap
    print("[OK] Backend ready")
