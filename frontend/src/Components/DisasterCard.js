import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const CATEGORY_MAP = {
  flood: { icon: "🌊", color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
  fire: { icon: "🔥", color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  wild_fire: { icon: "🔥", color: "#f97316", bg: "rgba(249,115,22,0.12)" },
  earthquake: { icon: "🏚️", color: "#a855f7", bg: "rgba(168,85,247,0.12)" },
  storm: { icon: "⛈️", color: "#06b6d4", bg: "rgba(6,182,212,0.12)" },
  cyclone: { icon: "🌀", color: "#06b6d4", bg: "rgba(6,182,212,0.12)" },
  drought: { icon: "☀️", color: "#eab308", bg: "rgba(234,179,8,0.12)" },
  landslide: { icon: "⛰️", color: "#78716c", bg: "rgba(120,113,108,0.12)" },
  tsunami: { icon: "🌊", color: "#0ea5e9", bg: "rgba(14,165,233,0.12)" },
};

const SEV_MAP = {
  critical: { color: "#ef4444", bg: "rgba(239,68,68,0.15)", border: "rgba(239,68,68,0.4)" },
  high: { color: "#f97316", bg: "rgba(249,115,22,0.15)", border: "rgba(249,115,22,0.4)" },
  medium: { color: "#eab308", bg: "rgba(234,179,8,0.15)", border: "rgba(234,179,8,0.4)" },
  low: { color: "#22c55e", bg: "rgba(34,197,94,0.15)", border: "rgba(34,197,94,0.4)" },
};

const getCat = (d) =>
  CATEGORY_MAP[(d.Label || d.category || "other").toLowerCase()] ||
  { icon: "⚠️", color: "#6366f1", bg: "rgba(99,102,241,0.12)" };

const getSev = (d) =>
  SEV_MAP[(d.Severity || d.severity || "low").toLowerCase()] || SEV_MAP.low;

const formatDate = (ts) => {
  if (!ts) return "Just now";
  const date = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  const diff = Math.floor((Date.now() - date) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export default function DisasterCard({ disaster: d }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const cat = getCat(d);
  const sev = getSev(d);

  return (
    <div
      style={{
        ...styles.card,
        ...(hovered ? styles.cardHover : {}),
        borderColor: sev.border,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Top row */}
      <div style={styles.top}>
        <span style={{ ...styles.catBadge, background: cat.bg, color: cat.color }}>
          {cat.icon} {(d.Label || d.category || "Other")}
        </span>
        <span style={{ ...styles.sevBadge, background: sev.bg, color: sev.color, borderColor: sev.border }}>
          {(d.Severity || d.severity || "Low").toUpperCase()}
        </span>
      </div>

      {/* Title */}
      <h3 style={styles.title}>{d.title || "Untitled Event"}</h3>

      {/* Location + time */}
      <div style={styles.meta}>
        {(d.Location || d.location) && (
          <span style={styles.metaItem}>
            <span style={styles.metaIcon}>📍</span>
            {d.Location || d.location}
          </span>
        )}
        <span style={styles.metaItem}>
          <span style={styles.metaIcon}>🕐</span>
          {formatDate(d.timestamp)}
        </span>
        {d.source && (
          <span style={styles.metaItem}>
            <span style={styles.metaIcon}>{d.source === "reddit" ? "🔴" : "🦋"}</span>
            {d.source}
          </span>
        )}
      </div>

      {/* Summary */}
      <p style={styles.summary}>{d.summary || d.Summary || "AI summary generating..."}</p>

      {/* Casualties */}
      {d.injured_or_dead_people && (
        <div style={styles.casualtyBox}>
          <span style={styles.casualtyIcon}>🏥</span>
          <span style={styles.casualtyText}>{d.injured_or_dead_people}</span>
        </div>
      )}

      {/* Expandable strategy */}
      {(d.Strategy || d.strategy) && (
        <>
          <button style={styles.expandBtn} onClick={() => setExpanded(!expanded)}>
            <span>🎯 NGO Strategy</span>
            <span style={{ ...styles.chevron, ...(expanded ? styles.chevronOpen : {}) }}>▾</span>
          </button>
          {expanded && (
            <div style={styles.strategy}>
              <p style={styles.strategyText}>{d.Strategy || d.strategy}</p>
            </div>
          )}
        </>
      )}

      {/* Keywords */}
      {d.keywords && d.keywords.length > 0 && (
        <div style={styles.keywords}>
          {d.keywords.slice(0, 4).map((kw, i) => (
            <span key={i} style={styles.keyword}>{kw}</span>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div style={styles.actions}>
        <button style={styles.ngoBtn} onClick={() => navigate("/ngo")}>
          🏥 NGO Dashboard
        </button>
        <button style={styles.helpBtn} onClick={() => navigate("/help")}>
          🚨 Report Location
        </button>
      </div>

      {/* Source link */}
      {d.url && (
        <a href={d.url} target="_blank" rel="noopener noreferrer" style={styles.srcLink}>
          View Source ↗
        </a>
      )}
    </div>
  );
}

const styles = {
  card: {
    background: "rgba(14,14,22,0.9)",
    borderRadius: "16px",
    padding: "22px",
    border: "1px solid",
    backdropFilter: "blur(12px)",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    transition: "transform 0.25s ease, box-shadow 0.25s ease",
    cursor: "default",
  },
  cardHover: {
    transform: "translateY(-4px)",
    boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
  },
  top: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  catBadge: {
    padding: "5px 12px",
    borderRadius: "20px",
    fontSize: "13px",
    fontWeight: "600",
    display: "flex",
    alignItems: "center",
    gap: "5px",
  },
  sevBadge: {
    padding: "4px 10px",
    borderRadius: "6px",
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.5px",
    border: "1px solid",
  },
  title: {
    fontSize: "17px",
    fontWeight: "700",
    color: "#f1f5f9",
    lineHeight: "1.4",
    margin: 0,
  },
  meta: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
  },
  metaItem: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "13px",
    color: "#64748b",
  },
  metaIcon: { fontSize: "12px" },
  summary: {
    fontSize: "14px",
    color: "#94a3b8",
    lineHeight: "1.6",
    margin: 0,
  },
  casualtyBox: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 14px",
    background: "rgba(239,68,68,0.08)",
    border: "1px solid rgba(239,68,68,0.2)",
    borderRadius: "10px",
  },
  casualtyIcon: { fontSize: "16px" },
  casualtyText: { fontSize: "13px", color: "#fca5a5", fontWeight: "500" },
  expandBtn: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    padding: "10px 14px",
    background: "rgba(99,102,241,0.08)",
    border: "1px solid rgba(99,102,241,0.2)",
    borderRadius: "10px",
    color: "#a5b4fc",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
  },
  chevron: {
    transition: "transform 0.2s ease",
    display: "inline-block",
  },
  chevronOpen: { transform: "rotate(180deg)" },
  strategy: {
    padding: "12px 14px",
    background: "rgba(15,15,25,0.8)",
    border: "1px solid rgba(99,102,241,0.15)",
    borderRadius: "10px",
  },
  strategyText: {
    fontSize: "13px",
    color: "#94a3b8",
    lineHeight: "1.6",
    margin: 0,
  },
  keywords: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
  },
  keyword: {
    padding: "3px 10px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "20px",
    fontSize: "12px",
    color: "#475569",
  },
  actions: {
    display: "flex",
    gap: "10px",
  },
  ngoBtn: {
    flex: 1,
    padding: "10px",
    background: "rgba(99,102,241,0.1)",
    border: "1px solid rgba(99,102,241,0.3)",
    borderRadius: "10px",
    color: "#a5b4fc",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "background 0.2s",
  },
  helpBtn: {
    flex: 1,
    padding: "10px",
    background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: "10px",
    color: "#fca5a5",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "background 0.2s",
  },
  srcLink: {
    fontSize: "12px",
    color: "#334155",
    textAlign: "center",
    textDecoration: "none",
    transition: "color 0.2s",
  },
};