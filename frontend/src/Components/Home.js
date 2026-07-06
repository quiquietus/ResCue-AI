import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig.js";
import DisasterCard from "./DisasterCard";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8001";

const CATEGORY_COUNTS = (disasters) => ({
  total: disasters.length,
  critical: disasters.filter((d) =>
    ["critical", "high", "severe"].includes((d.Severity || d.severity || "").toLowerCase())
  ).length,
  flood: disasters.filter((d) =>
    (d.Label || d.category || "").toLowerCase().includes("flood")
  ).length,
  fire: disasters.filter((d) =>
    (d.Label || d.category || "").toLowerCase().includes("fire")
  ).length,
});

export default function Home() {
  const [disasters, setDisasters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Primary: real-time Firestore listener
  useEffect(() => {
    const q = query(collection(db, "disaster_reports"));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (data.length > 0) {
          setDisasters(data);
          setLoading(false);
        } else {
          // Firestore empty — fall back to backend mock feed
          fetchBackendFeed();
        }
      },
      () => fetchBackendFeed()
    );
    return () => unsubscribe();
  }, []);

  const fetchBackendFeed = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/social-feed`);
      if (res.ok) {
        const data = await res.json();
        setDisasters(data);
      }
    } catch (e) {
      console.error("Backend feed error:", e);
    } finally {
      setLoading(false);
    }
  };

  const counts = CATEGORY_COUNTS(disasters);

  const filtered = disasters.filter((d) => {
    const label = (d.Label || d.category || "").toLowerCase();
    const sev = (d.Severity || d.severity || "").toLowerCase();
    const matchFilter =
      filter === "all" ||
      (filter === "critical" && ["critical", "high", "severe"].includes(sev)) ||
      label.includes(filter);
    const matchSearch =
      !searchTerm ||
      (d.title || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.Location || d.location || "").toLowerCase().includes(searchTerm.toLowerCase());
    return matchFilter && matchSearch;
  });

  return (
    <div style={styles.page}>
      {/* Hero */}
      <section style={styles.hero}>
        <div style={styles.heroBg} />
        <div style={styles.heroContent}>
          <div style={styles.heroBadge}>
            <span style={styles.heroBadgeDot} />
            Live Monitoring Active
          </div>
          <h1 style={styles.heroTitle}>
            AI-Powered
            <br />
            <span style={styles.heroGradient}>Disaster Intelligence</span>
          </h1>
          <p style={styles.heroSubtitle}>
            Real-time disaster tracking from Reddit &amp; BlueSky, classified and enriched
            by Llama 3 AI to help NGOs respond faster.
          </p>

          {/* Stats */}
          {!loading && (
            <div style={styles.statsRow}>
              {[
                { label: "Active Events", value: counts.total, color: "#6366f1" },
                { label: "Critical", value: counts.critical, color: "#ef4444" },
                { label: "Floods", value: counts.flood, color: "#3b82f6" },
                { label: "Fires", value: counts.fire, color: "#f97316" },
              ].map((s) => (
                <div key={s.label} style={styles.statCard}>
                  <span style={{ ...styles.statNum, color: s.color }}>{s.value}</span>
                  <span style={styles.statLabel}>{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Filters + Search */}
      <div style={styles.controls}>
        <div style={styles.searchWrap}>
          <span style={styles.searchIcon}>🔍</span>
          <input
            style={styles.searchInput}
            placeholder="Search by event or location..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div style={styles.filterRow}>
          {["all", "critical", "flood", "fire", "earthquake", "storm"].map((f) => (
            <button
              key={f}
              style={{ ...styles.filterBtn, ...(filter === f ? styles.filterBtnActive : {}) }}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={styles.content}>
        {loading ? (
          <LoadingGrid />
        ) : filtered.length === 0 ? (
          <div style={styles.empty}>
            <div style={styles.emptyIcon}>🌐</div>
            <h3 style={styles.emptyTitle}>No disasters found</h3>
            <p style={styles.emptyText}>
              {searchTerm || filter !== "all"
                ? "Try adjusting your filters"
                : "The AI pipeline is monitoring social media for disaster events."}
            </p>
          </div>
        ) : (
          <>
            <div style={styles.feedHeader}>
              <h2 style={styles.feedTitle}>Recent Disasters</h2>
              <span style={styles.feedCount}>{filtered.length} events</span>
            </div>
            <div style={styles.grid}>
              {filtered.map((d) => (
                <DisasterCard key={d.id} disaster={d} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LoadingGrid() {
  return (
    <div style={{ padding: "40px 0" }}>
      <div style={{ textAlign: "center", marginBottom: "40px" }}>
        <div style={skeletonStyles.spinner} />
        <p style={{ color: "#64748b", marginTop: "16px" }}>
          Fetching live disaster data...
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: "24px" }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={skeletonStyles.card}>
            <div style={{ ...skeletonStyles.line, width: "60%", marginBottom: "12px" }} />
            <div style={{ ...skeletonStyles.line, width: "90%", marginBottom: "8px" }} />
            <div style={{ ...skeletonStyles.line, width: "75%" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

const skeletonStyles = {
  spinner: {
    width: "40px",
    height: "40px",
    border: "3px solid rgba(99,102,241,0.2)",
    borderTop: "3px solid #6366f1",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
    margin: "0 auto",
  },
  card: {
    background: "rgba(30,30,50,0.5)",
    borderRadius: "16px",
    padding: "24px",
    border: "1px solid rgba(255,255,255,0.05)",
  },
  line: {
    height: "14px",
    background: "linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 75%)",
    backgroundSize: "200% 100%",
    borderRadius: "7px",
    animation: "shimmer 1.5s infinite",
  },
};

const styles = {
  page: { minHeight: "100vh", background: "#0a0a0f" },

  // Hero
  hero: {
    position: "relative",
    padding: "80px 24px 60px",
    overflow: "hidden",
  },
  heroBg: {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(99,102,241,0.2) 0%, transparent 70%), " +
      "radial-gradient(ellipse 40% 40% at 80% 50%, rgba(168,85,247,0.1) 0%, transparent 60%)",
    pointerEvents: "none",
  },
  heroContent: {
    maxWidth: "900px",
    margin: "0 auto",
    textAlign: "center",
    position: "relative",
    zIndex: 1,
  },
  heroBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 16px",
    background: "rgba(99,102,241,0.12)",
    border: "1px solid rgba(99,102,241,0.3)",
    borderRadius: "100px",
    fontSize: "13px",
    fontWeight: "500",
    color: "#a5b4fc",
    marginBottom: "24px",
  },
  heroBadgeDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: "#22c55e",
    boxShadow: "0 0 8px #22c55e",
    display: "inline-block",
    animation: "pulse 2s ease-in-out infinite",
  },
  heroTitle: {
    fontSize: "clamp(36px, 6vw, 72px)",
    fontWeight: "900",
    lineHeight: "1.1",
    color: "#f8fafc",
    marginBottom: "20px",
    letterSpacing: "-2px",
  },
  heroGradient: {
    background: "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  heroSubtitle: {
    fontSize: "18px",
    color: "#64748b",
    maxWidth: "600px",
    margin: "0 auto 40px",
    lineHeight: "1.7",
  },
  statsRow: {
    display: "flex",
    justifyContent: "center",
    gap: "16px",
    flexWrap: "wrap",
  },
  statCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "20px 28px",
    background: "rgba(20,20,35,0.8)",
    borderRadius: "16px",
    border: "1px solid rgba(255,255,255,0.06)",
    backdropFilter: "blur(12px)",
    minWidth: "110px",
    gap: "4px",
  },
  statNum: {
    fontSize: "36px",
    fontWeight: "800",
    lineHeight: "1",
  },
  statLabel: {
    fontSize: "12px",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: "1px",
    fontWeight: "500",
  },

  // Controls
  controls: {
    maxWidth: "1280px",
    margin: "0 auto",
    padding: "0 24px 24px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  searchWrap: {
    position: "relative",
    maxWidth: "500px",
  },
  searchIcon: {
    position: "absolute",
    left: "16px",
    top: "50%",
    transform: "translateY(-50%)",
    fontSize: "16px",
    pointerEvents: "none",
  },
  searchInput: {
    width: "100%",
    padding: "12px 16px 12px 44px",
    background: "rgba(20,20,35,0.8)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "12px",
    color: "#e2e8f0",
    fontSize: "14px",
    outline: "none",
    transition: "border-color 0.2s",
  },
  filterRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  filterBtn: {
    padding: "7px 16px",
    background: "rgba(20,20,35,0.6)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "8px",
    color: "#64748b",
    fontSize: "13px",
    fontWeight: "500",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  filterBtnActive: {
    background: "rgba(99,102,241,0.15)",
    border: "1px solid rgba(99,102,241,0.4)",
    color: "#a5b4fc",
  },

  // Content
  content: {
    maxWidth: "1280px",
    margin: "0 auto",
    padding: "0 24px 60px",
  },
  feedHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "24px",
  },
  feedTitle: {
    fontSize: "22px",
    fontWeight: "700",
    color: "#f1f5f9",
  },
  feedCount: {
    fontSize: "14px",
    color: "#475569",
    padding: "4px 12px",
    background: "rgba(255,255,255,0.04)",
    borderRadius: "20px",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
    gap: "24px",
  },

  // Empty
  empty: {
    textAlign: "center",
    padding: "80px 20px",
  },
  emptyIcon: { fontSize: "64px", marginBottom: "20px" },
  emptyTitle: { fontSize: "22px", fontWeight: "700", color: "#e2e8f0", marginBottom: "10px" },
  emptyText: { fontSize: "15px", color: "#64748b" },
};
