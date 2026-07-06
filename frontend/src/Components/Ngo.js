import React, { useState, useEffect } from "react";
import { GoogleMap, useJsApiLoader, Marker, Circle, Polyline, InfoWindow } from "@react-google-maps/api";

const API_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8001";
const MAPS_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY || "";

const MAP_CONTAINER = { width: "100%", height: "100%" };
const MAP_CENTER = { lat: 28.65, lng: 77.15 };
const LIBRARIES = ["visualization"];

const DARK_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#0a0f1e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0a0f1e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#4b5563" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#6b7280" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#111827" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#1f2937" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#4b5563" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#050d1a" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#1f2937" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] },
];

const STEPS = [
  { id: 1, icon: "📍", title: "Incidents", desc: "View all reported disaster incidents" },
  { id: 2, icon: "🏥", title: "Relief Centers", desc: "DBSCAN-optimized center locations" },
  { id: 3, icon: "🛣️", title: "Route Network", desc: "Shortest paths to all victims" },
];

export default function NgoPortal() {
  const [step, setStep] = useState(1);
  const [disasterPoints, setDisasterPoints] = useState([]);
  const [clusteredPoints, setClusteredPoints] = useState([]);
  const [reliefCenters, setReliefCenters] = useState([]);
  const [shortestPaths, setShortestPaths] = useState({});
  const [clusterColors, setClusterColors] = useState({});
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reliefUnits, setReliefUnits] = useState(5);
  const [stats, setStats] = useState({ severe: 0, nonSevere: 0, clusters: 0, centers: 0 });

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: MAPS_KEY,
    id: "rescue-ai-map",
    libraries: LIBRARIES,
  });

  // Load initial disaster points
  useEffect(() => {
    const fetchPoints = async () => {
      try {
        const res = await fetch(`${API_URL}/disaster-points`);
        if (!res.ok) throw new Error("Failed to load disaster points");
        const data = await res.json();
        setDisasterPoints(data);
        const sev = data.filter((p) => p.severity === "high").length;
        setStats((s) => ({ ...s, severe: sev, nonSevere: data.length - sev }));
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchPoints();
  }, []);

  const handleIdentifyReliefCenters = async () => {
    setActionLoading(true);
    try {
      const [clustersRes, colorsRes, centersRes] = await Promise.all([
        fetch(`${API_URL}/clustered-points`),
        fetch(`${API_URL}/colormap`),
        fetch(`${API_URL}/relief-centers`),
      ]);
      if (!clustersRes.ok || !colorsRes.ok || !centersRes.ok)
        throw new Error("Failed to load clustering data");

      const [clusters, colors, centers] = await Promise.all([
        clustersRes.json(),
        colorsRes.json(),
        centersRes.json(),
      ]);

      setClusteredPoints(clusters);
      setClusterColors(colors);
      setReliefCenters(centers);
      const uniqueClusters = new Set(clusters.map((p) => p.cluster).filter((c) => c !== -1));
      setStats((s) => ({ ...s, clusters: uniqueClusters.size, centers: centers.length }));
      setStep(2);
    } catch (e) {
      setError(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleGetRoutes = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`${API_URL}/shortest-paths`);
      if (!res.ok) throw new Error("Failed to calculate routes");
      const data = await res.json();
      setShortestPaths(data);
      setStep(3);
    } catch (e) {
      setError(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setClusteredPoints([]);
    setReliefCenters([]);
    setShortestPaths({});
    setClusterColors({});
    setSelectedPoint(null);
  };

  if (!isLoaded || loading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} onRetry={() => window.location.reload()} />;

  return (
    <div style={styles.layout}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        {/* Logo area */}
        <div style={styles.sidebarHeader}>
          <div style={styles.sidebarLogo}>🛟</div>
          <div>
            <div style={styles.sidebarTitle}>NGO Dashboard</div>
            <div style={styles.sidebarSub}>Disaster Response AI</div>
          </div>
        </div>

        {/* Stats */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>📊 Statistics</div>
          <div style={styles.statsGrid}>
            <StatCard label="Severe" value={stats.severe} color="#ef4444" icon="🔴" />
            <StatCard label="Non-Severe" value={stats.nonSevere} color="#6366f1" icon="🔵" />
            {step >= 2 && (
              <>
                <StatCard label="Clusters" value={stats.clusters} color="#a855f7" icon="🔷" />
                <StatCard label="Centers" value={stats.centers} color="#22c55e" icon="🏥" />
              </>
            )}
          </div>
        </div>

        {/* Workflow steps */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>🔄 Workflow</div>
          {STEPS.map((s) => (
            <div
              key={s.id}
              style={{ ...styles.workflowStep, ...(step >= s.id ? styles.workflowStepActive : {}) }}
            >
              <div style={{ ...styles.stepBubble, ...(step >= s.id ? styles.stepBubbleActive : {}) }}>
                {step > s.id ? "✓" : s.id}
              </div>
              <div>
                <div style={styles.stepTitle}>{s.icon} {s.title}</div>
                <div style={styles.stepDesc}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>⚙️ Controls</div>

          {step === 1 && (
            <>
              <div style={styles.inputGroup}>
                <label style={styles.inputLabel}>Relief Units Available</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={reliefUnits}
                  onChange={(e) => setReliefUnits(Number(e.target.value))}
                  style={styles.input}
                />
              </div>
              <ActionButton
                onClick={handleIdentifyReliefCenters}
                loading={actionLoading}
                icon="🏥"
                label="Identify Relief Centers"
                color="#6366f1"
              />
            </>
          )}

          {step === 2 && (
            <>
              <div style={styles.infoAlert}>
                <strong>{reliefCenters.length}</strong> optimal relief centers identified
                using DBSCAN clustering
              </div>
              <ActionButton
                onClick={handleGetRoutes}
                loading={actionLoading}
                icon="🛣️"
                label="Calculate Optimal Routes"
                color="#a855f7"
              />
            </>
          )}

          {step === 3 && (
            <>
              <div style={styles.infoAlert}>
                Route network computed using Google Maps Directions API
              </div>
              <ActionButton
                onClick={handleReset}
                loading={false}
                icon="🔄"
                label="Reset & Start Over"
                color="#475569"
              />
            </>
          )}
        </div>

        {/* Legend */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>🗂️ Legend</div>
          {step === 1 && (
            <div style={styles.legendList}>
              <LegendItem color="#ef4444" label="Severe Incident" />
              <LegendItem color="#6366f1" label="Non-Severe Incident" />
            </div>
          )}
          {step >= 2 && (
            <div style={styles.legendList}>
              <LegendItem color="#555555" label="Unclustered" />
              {Object.entries(clusterColors)
                .filter(([k]) => k !== "-1")
                .slice(0, 8)
                .map(([k, color]) => (
                  <LegendItem key={k} color={color} label={`Cluster ${k}`} />
                ))}
              <LegendItem color="#ffffff" label="Relief Center" dot={false} isCenter />
            </div>
          )}
        </div>
      </aside>

      {/* Map container */}
      <div style={styles.mapWrap}>
        {/* Map overlay header */}
        <div style={styles.mapOverlay}>
          <div style={styles.mapOverlayTitle}>
            {step === 1 && "📍 Disaster Incidents"}
            {step === 2 && "🏥 Relief Centers & Clusters"}
            {step === 3 && "🛣️ Response Route Network"}
          </div>
          <div style={styles.mapOverlaySub}>
            {step === 1 && `${disasterPoints.length} incidents reported`}
            {step === 2 && `${reliefCenters.length} centers · ${clusteredPoints.length} points clustered`}
            {step === 3 && `Full route network optimized`}
          </div>
        </div>

        <GoogleMap
          mapContainerStyle={MAP_CONTAINER}
          center={MAP_CENTER}
          zoom={11}
          options={{
            styles: DARK_MAP_STYLES,
            disableDefaultUI: true,
            zoomControl: true,
            fullscreenControl: true,
          }}
        >
          {/* Step 1: raw points */}
          {step === 1 &&
            disasterPoints.map((pt, i) => (
              <Circle
                key={`raw-${i}`}
                center={{ lat: pt.lat, lng: pt.lon }}
                radius={280}
                options={{
                  fillColor: pt.severity === "high" ? "#ef4444" : "#6366f1",
                  fillOpacity: 0.85,
                  strokeColor: pt.severity === "high" ? "#ef4444" : "#6366f1",
                  strokeWeight: 2,
                  strokeOpacity: 1,
                }}
                onClick={() => setSelectedPoint({ ...pt, id: i })}
              />
            ))}

          {/* Step 2+: clustered colored points */}
          {step >= 2 &&
            clusteredPoints.map((pt, i) => (
              <Circle
                key={`cl-${i}`}
                center={{ lat: pt.lat, lng: pt.lon }}
                radius={280}
                options={{
                  fillColor: pt.cluster === -1 ? "#555" : (clusterColors[pt.cluster] || "#888"),
                  fillOpacity: 0.85,
                  strokeColor: pt.cluster === -1 ? "#555" : (clusterColors[pt.cluster] || "#888"),
                  strokeWeight: 2,
                  strokeOpacity: 1,
                }}
                onClick={() => setSelectedPoint({ ...pt, id: i })}
              />
            ))}

          {/* Step 2+: Relief center markers */}
          {step >= 2 &&
            reliefCenters.map((c, i) => (
              <Marker
                key={`center-${i}`}
                position={{ lat: c.lat, lng: c.lon }}
                icon={{
                  path: window.google.maps.SymbolPath.CIRCLE,
                  scale: 14,
                  fillColor: "#fff",
                  fillOpacity: 1,
                  strokeColor: clusterColors[c.dbscan_cluster] || "#6366f1",
                  strokeWeight: 5,
                }}
                title={`Relief Center — Cluster ${c.dbscan_cluster} (${c.point_count} victims, ${c.severe_count} severe)`}
                onClick={() => setSelectedPoint({ ...c, isCenter: true })}
              />
            ))}

          {/* Step 3: Route polylines */}
          {step === 3 &&
            Object.entries(shortestPaths).map(([clusterId, paths]) =>
              paths.map((pathData, pi) => (
                <Polyline
                  key={`path-${clusterId}-${pi}`}
                  path={pathData.path.map(([la, lo]) => ({ lat: la, lng: lo }))}
                  options={{
                    strokeColor: clusterColors[parseInt(clusterId)] || "#6366f1",
                    strokeOpacity: 0.7,
                    strokeWeight: pathData.severity === "high" ? 4 : 2.5,
                  }}
                />
              ))
            )}

          {/* Info window */}
          {selectedPoint && (
            <InfoWindow
              position={{ lat: selectedPoint.lat, lng: selectedPoint.lon }}
              onCloseClick={() => setSelectedPoint(null)}
            >
              <div style={styles.infoWin}>
                {selectedPoint.isCenter ? (
                  <>
                    <div style={styles.infoWinTitle}>🏥 Relief Center</div>
                    <p style={styles.infoWinRow}><strong>Cluster:</strong> {selectedPoint.dbscan_cluster}</p>
                    <p style={styles.infoWinRow}><strong>Victims nearby:</strong> {selectedPoint.point_count}</p>
                    <p style={styles.infoWinRow}><strong>Severe cases:</strong> {selectedPoint.severe_count}</p>
                    <p style={styles.infoWinRow}><strong>Location:</strong> {selectedPoint.lat?.toFixed(4)}, {selectedPoint.lon?.toFixed(4)}</p>
                  </>
                ) : (
                  <>
                    <div style={styles.infoWinTitle}>📍 Incident #{selectedPoint.id}</div>
                    <p style={styles.infoWinRow}><strong>Severity:</strong>{" "}
                      <span style={{ color: selectedPoint.severity === "high" ? "#ef4444" : "#6366f1" }}>
                        {selectedPoint.severity?.toUpperCase()}
                      </span>
                    </p>
                    {selectedPoint.cluster !== undefined && (
                      <p style={styles.infoWinRow}><strong>Cluster:</strong>{" "}
                        {selectedPoint.cluster === -1 ? "Unclustered" : selectedPoint.cluster}
                      </p>
                    )}
                    <p style={styles.infoWinRow}><strong>Coords:</strong> {selectedPoint.lat?.toFixed(4)}, {selectedPoint.lon?.toFixed(4)}</p>
                  </>
                )}
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, color, icon }) {
  return (
    <div style={styles.statCard}>
      <span style={{ fontSize: "20px" }}>{icon}</span>
      <span style={{ ...styles.statValue, color }}>{value}</span>
      <span style={styles.statLabel}>{label}</span>
    </div>
  );
}

function ActionButton({ onClick, loading, icon, label, color }) {
  return (
    <button
      style={{
        ...styles.actionBtn,
        background: `linear-gradient(135deg, ${color}, ${color}cc)`,
        boxShadow: `0 4px 15px ${color}44`,
        opacity: loading ? 0.7 : 1,
        cursor: loading ? "wait" : "pointer",
      }}
      onClick={onClick}
      disabled={loading}
    >
      {loading ? (
        <><span style={styles.spinner} /> Processing...</>
      ) : (
        <>{icon} {label}</>
      )}
    </button>
  );
}

function LegendItem({ color, label, isCenter }) {
  return (
    <div style={styles.legendItem}>
      <div
        style={{
          ...styles.legendDot,
          background: isCenter ? "transparent" : color,
          border: isCenter ? `3px solid ${color || "#fff"}` : "none",
        }}
      />
      <span style={styles.legendLabel}>{label}</span>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={styles.fullScreen}>
      <div style={styles.spinner} />
      <p style={{ color: "#475569", marginTop: "20px" }}>Initializing NGO Dashboard...</p>
    </div>
  );
}

function ErrorScreen({ message, onRetry }) {
  return (
    <div style={styles.fullScreen}>
      <div style={{ fontSize: "48px", marginBottom: "16px" }}>⚠️</div>
      <h2 style={{ color: "#f87171", marginBottom: "8px" }}>Connection Error</h2>
      <p style={{ color: "#64748b", marginBottom: "24px", maxWidth: "400px", textAlign: "center" }}>{message}</p>
      <button onClick={onRetry} style={styles.retryBtn}>Retry</button>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  layout: {
    display: "flex",
    height: "calc(100vh - 68px)",
    background: "#0a0a0f",
    overflow: "hidden",
  },

  sidebar: {
    width: "300px",
    flexShrink: 0,
    background: "rgba(10,10,18,0.97)",
    borderRight: "1px solid rgba(255,255,255,0.06)",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "0",
  },

  sidebarHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "20px 20px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
  },
  sidebarLogo: {
    fontSize: "32px",
    filter: "drop-shadow(0 0 8px rgba(99,102,241,0.5))",
  },
  sidebarTitle: {
    fontSize: "16px",
    fontWeight: "700",
    color: "#f1f5f9",
  },
  sidebarSub: {
    fontSize: "12px",
    color: "#475569",
  },

  section: {
    padding: "16px 20px",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
  },
  sectionTitle: {
    fontSize: "11px",
    fontWeight: "600",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: "1px",
    marginBottom: "12px",
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "8px",
  },
  statCard: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: "10px",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    alignItems: "center",
    textAlign: "center",
  },
  statValue: {
    fontSize: "24px",
    fontWeight: "800",
    lineHeight: "1",
  },
  statLabel: {
    fontSize: "11px",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },

  workflowStep: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "10px 12px",
    borderRadius: "10px",
    marginBottom: "6px",
    border: "1px solid transparent",
    transition: "all 0.2s",
  },
  workflowStepActive: {
    background: "rgba(99,102,241,0.08)",
    border: "1px solid rgba(99,102,241,0.2)",
  },
  stepBubble: {
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "12px",
    fontWeight: "700",
    color: "#475569",
    flexShrink: 0,
  },
  stepBubbleActive: {
    background: "rgba(99,102,241,0.2)",
    border: "1px solid rgba(99,102,241,0.5)",
    color: "#a5b4fc",
  },
  stepTitle: { fontSize: "13px", fontWeight: "600", color: "#e2e8f0" },
  stepDesc: { fontSize: "11px", color: "#475569", marginTop: "2px" },

  inputGroup: { marginBottom: "12px" },
  inputLabel: {
    display: "block",
    fontSize: "12px",
    color: "#64748b",
    fontWeight: "500",
    marginBottom: "6px",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "8px",
    color: "#e2e8f0",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
  },

  actionBtn: {
    width: "100%",
    padding: "12px",
    border: "none",
    borderRadius: "10px",
    color: "#fff",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    transition: "all 0.2s",
    marginBottom: "8px",
  },

  infoAlert: {
    padding: "10px 12px",
    background: "rgba(99,102,241,0.08)",
    border: "1px solid rgba(99,102,241,0.2)",
    borderRadius: "8px",
    fontSize: "13px",
    color: "#94a3b8",
    lineHeight: "1.5",
    marginBottom: "12px",
  },

  legendList: { display: "flex", flexDirection: "column", gap: "8px" },
  legendItem: { display: "flex", alignItems: "center", gap: "10px" },
  legendDot: {
    width: "12px",
    height: "12px",
    borderRadius: "50%",
    flexShrink: 0,
  },
  legendLabel: { fontSize: "13px", color: "#64748b" },

  mapWrap: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
  },
  mapOverlay: {
    position: "absolute",
    top: "16px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 10,
    background: "rgba(10,10,18,0.9)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "12px",
    padding: "10px 20px",
    textAlign: "center",
    pointerEvents: "none",
  },
  mapOverlayTitle: { fontSize: "15px", fontWeight: "700", color: "#f1f5f9" },
  mapOverlaySub: { fontSize: "12px", color: "#475569", marginTop: "2px" },

  infoWin: {
    background: "#0d1117",
    color: "#f1f5f9",
    fontFamily: "Inter, sans-serif",
    minWidth: "180px",
    padding: "4px",
  },
  infoWinTitle: {
    fontSize: "14px",
    fontWeight: "700",
    marginBottom: "8px",
    color: "#e2e8f0",
  },
  infoWinRow: {
    fontSize: "13px",
    color: "#94a3b8",
    marginBottom: "4px",
  },

  spinner: {
    width: "32px",
    height: "32px",
    border: "3px solid rgba(99,102,241,0.2)",
    borderTop: "3px solid #6366f1",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
    display: "inline-block",
  },

  fullScreen: {
    height: "calc(100vh - 68px)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "#0a0a0f",
  },

  retryBtn: {
    padding: "10px 28px",
    background: "rgba(99,102,241,0.15)",
    border: "1px solid rgba(99,102,241,0.4)",
    borderRadius: "10px",
    color: "#a5b4fc",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },
};