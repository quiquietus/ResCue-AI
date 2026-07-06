import React, { useState } from "react";
import { GoogleMap, useJsApiLoader, Marker, Circle, InfoWindow } from "@react-google-maps/api";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8001";
const MAPS_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY || "";

const MAP_CONTAINER = { width: "100%", height: "100%" };
const LIBRARIES = ["visualization"];

const DARK_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#0d1117" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0d1117" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#6b7280" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#9ca3af" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1f2937" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#374151" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#6b7280" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a1628" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#374151" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] },
];

const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 };

export default function UserForm() {
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const stats = {
    total: markers.length,
    severe: markers.filter((m) => m.severity === "severe").length,
    mild: markers.filter((m) => m.severity !== "severe").length,
  };

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: MAPS_KEY,
    id: "rescue-ai-map",
    libraries: LIBRARIES,
  });

  const showToast = (message, type = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleFileChange = (f) => {
    if (!f) return;
    setFile(f);
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("image/")) handleFileChange(f);
  };

  const handleGps = () => {
    if (!navigator.geolocation) {
      showToast("Geolocation not supported by your browser", "error");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setGpsLoading(false);
        showToast("📍 Location detected successfully!", "success");
      },
      () => {
        setGpsLoading(false);
        showToast("Could not detect location. Please enter manually.", "error");
      },
      { timeout: 10000 }
    );
  };

  const handleSubmit = async () => {
    if (!lat || !lng) {
      showToast("Please provide latitude and longitude", "error");
      return;
    }
    if (!file) {
      showToast("Please upload a disaster image", "error");
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append("latitude", lat);
    formData.append("longitude", lng);
    formData.append("image", file);

    try {
      const res = await axios.post(`${BACKEND_URL}/classify`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const data = res.data;

      if (!data.display) {
        showToast("✅ No disaster detected at this location.", "info");
      } else {
        setMarkers((prev) => [
          ...prev,
          {
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            severity: data.classification,
            label: data.label,
            confidence: data.confidence,
            timestamp: new Date().toLocaleTimeString(),
            imageUrl: preview,
          },
        ]);
        showToast(
          `🚨 Disaster classified: ${data.label} (${data.classification})`,
          data.classification === "severe" ? "error" : "warning"
        );
        setLat("");
        setLng("");
        setFile(null);
        setFileName("");
        setPreview(null);
      }
    } catch (err) {
      const msg = err.response?.data?.detail || "Error processing request. Is the backend running?";
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      {/* Toast */}
      {toast && (
        <div style={{ ...styles.toast, ...(TOAST_COLORS[toast.type] || TOAST_COLORS.info) }}>
          {toast.message}
        </div>
      )}

      {/* Page header */}
      <div style={styles.header}>
        <div style={styles.headerBg} />
        <div style={styles.headerContent}>
          <div style={styles.headerBadge}>🚨 Local Victim Platform</div>
          <h1 style={styles.headerTitle}>Report a Disaster</h1>
          <p style={styles.headerSub}>
            Upload an image with your GPS coordinates. Our ResNet50 AI model will classify
            the severity and display it on the map for NGOs to respond.
          </p>
        </div>
      </div>

      {/* Main layout */}
      <div style={styles.layout}>
        {/* Left panel */}
        <div style={styles.leftPanel}>
          {/* Stats */}
          <div style={styles.statsRow}>
            {[
              { label: "Reported", value: stats.total, color: "#6366f1" },
              { label: "Severe", value: stats.severe, color: "#ef4444" },
              { label: "Mild", value: stats.mild, color: "#eab308" },
            ].map((s) => (
              <div key={s.label} style={styles.statBox}>
                <span style={{ ...styles.statNum, color: s.color }}>{s.value}</span>
                <span style={styles.statLbl}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* Form card */}
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>📋 Incident Report</h2>

            {/* GPS */}
            <div style={styles.gpsSection}>
              <div style={styles.coordRow}>
                <div style={styles.coordField}>
                  <label style={styles.label}>Latitude</label>
                  <input
                    style={styles.input}
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    placeholder="e.g. 20.5937"
                    type="number"
                    step="any"
                  />
                </div>
                <div style={styles.coordField}>
                  <label style={styles.label}>Longitude</label>
                  <input
                    style={styles.input}
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    placeholder="e.g. 78.9629"
                    type="number"
                    step="any"
                  />
                </div>
              </div>
              <button
                style={{ ...styles.gpsBtn, ...(gpsLoading ? styles.gpsBtnLoading : {}) }}
                onClick={handleGps}
                disabled={gpsLoading}
              >
                {gpsLoading ? "🔄 Detecting..." : "📍 Use My GPS Location"}
              </button>
            </div>

            {/* Image upload */}
            <div
              style={{
                ...styles.dropzone,
                ...(dragOver ? styles.dropzoneActive : {}),
                ...(preview ? styles.dropzoneWithPreview : {}),
              }}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => document.getElementById("file-input").click()}
            >
              {preview ? (
                <>
                  <img src={preview} alt="preview" style={styles.preview} />
                  <div style={styles.previewOverlay}>
                    <span style={styles.previewOverlayText}>🔄 Click to change</span>
                  </div>
                </>
              ) : (
                <>
                  <div style={styles.dropIcon}>📸</div>
                  <p style={styles.dropTitle}>Drop image here or click to upload</p>
                  <p style={styles.dropSub}>JPEG, PNG, WebP supported</p>
                </>
              )}
              <input
                id="file-input"
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => handleFileChange(e.target.files[0])}
              />
            </div>

            {fileName && !preview && (
              <p style={styles.fileName}>📎 {fileName}</p>
            )}

            {/* Submit */}
            <button
              style={{ ...styles.submitBtn, ...(loading ? styles.submitBtnLoading : {}) }}
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <><span style={styles.btnSpinner} /> Analyzing with ResNet50...</>
              ) : (
                "🚨 Submit Disaster Report"
              )}
            </button>

            {/* Info box */}
            <div style={styles.infoBox}>
              <p style={styles.infoText}>
                🤖 <strong>How it works:</strong> Your image is analyzed by a fine-tuned ResNet50
                model trained on disaster imagery. Severe incidents are highlighted in red on the NGO map.
              </p>
            </div>
          </div>
        </div>

        {/* Right: Map */}
        <div style={styles.mapPanel}>
          <div style={styles.mapCard}>
            <div style={styles.mapHeader}>
              <span style={styles.mapTitle}>🗺️ Disaster Map</span>
              <div style={styles.mapLegend}>
                <span style={styles.legendDot("red")} /> Severe
                <span style={{ ...styles.legendDot("yellow"), marginLeft: "12px" }} /> Mild
              </div>
            </div>
            <div style={styles.mapBody}>
              {isLoaded ? (
                <GoogleMap
                  mapContainerStyle={MAP_CONTAINER}
                  center={DEFAULT_CENTER}
                  zoom={5}
                  options={{
                    styles: DARK_MAP_STYLES,
                    disableDefaultUI: false,
                    zoomControl: true,
                    mapTypeControl: false,
                    streetViewControl: false,
                    fullscreenControl: true,
                  }}
                >
                  {markers.map((m, i) => (
                    <React.Fragment key={i}>
                      <Circle
                        center={{ lat: m.lat, lng: m.lng }}
                        radius={15000}
                        options={{
                          fillColor: m.severity === "severe" ? "#ef4444" : "#eab308",
                          fillOpacity: 0.2,
                          strokeColor: m.severity === "severe" ? "#ef4444" : "#eab308",
                          strokeWeight: 1,
                          strokeOpacity: 0.4,
                        }}
                      />
                      <Marker
                        position={{ lat: m.lat, lng: m.lng }}
                        icon={{
                          url:
                            m.severity === "severe"
                              ? "http://maps.google.com/mapfiles/ms/icons/red-dot.png"
                              : "http://maps.google.com/mapfiles/ms/icons/yellow-dot.png",
                          scaledSize: new window.google.maps.Size(40, 40),
                        }}
                        onClick={() => setSelectedMarker(m)}
                      />
                    </React.Fragment>
                  ))}

                  {selectedMarker && (
                    <InfoWindow
                      position={{ lat: selectedMarker.lat, lng: selectedMarker.lng }}
                      onCloseClick={() => setSelectedMarker(null)}
                    >
                      <div style={styles.infoWindow}>
                        <div style={{
                          ...styles.infoWinBadge,
                          background: selectedMarker.severity === "severe" ? "rgba(239,68,68,0.15)" : "rgba(234,179,8,0.15)",
                          color: selectedMarker.severity === "severe" ? "#ef4444" : "#ca8a04",
                        }}>
                          {selectedMarker.severity === "severe" ? "🔴 SEVERE" : "🟡 MILD"}
                        </div>
                        <p style={styles.infoWinLabel}><strong>Type:</strong> {selectedMarker.label}</p>
                        <p style={styles.infoWinLabel}><strong>Confidence:</strong> {(selectedMarker.confidence * 100).toFixed(1)}%</p>
                        <p style={styles.infoWinLabel}><strong>Reported:</strong> {selectedMarker.timestamp}</p>
                        <p style={styles.infoWinLabel}><strong>Coords:</strong> {selectedMarker.lat.toFixed(4)}, {selectedMarker.lng.toFixed(4)}</p>
                        {selectedMarker.imageUrl && (
                          <img src={selectedMarker.imageUrl} alt="disaster" style={styles.infoWinImg} />
                        )}
                      </div>
                    </InfoWindow>
                  )}
                </GoogleMap>
              ) : (
                <div style={styles.mapPlaceholder}>
                  <div style={styles.mapLoader} />
                  <p style={{ color: "#475569", marginTop: "12px" }}>Loading map...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const TOAST_COLORS = {
  success: { background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)", color: "#4ade80" },
  error: { background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", color: "#f87171" },
  warning: { background: "rgba(234,179,8,0.15)", border: "1px solid rgba(234,179,8,0.4)", color: "#facc15" },
  info: { background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.4)", color: "#a5b4fc" },
};

const styles = {
  page: { minHeight: "100vh", background: "#0a0a0f", paddingBottom: "60px" },

  toast: {
    position: "fixed",
    top: "80px",
    right: "24px",
    zIndex: 9999,
    padding: "14px 20px",
    borderRadius: "12px",
    fontSize: "14px",
    fontWeight: "500",
    maxWidth: "360px",
    animation: "slideIn 0.3s ease",
    backdropFilter: "blur(10px)",
  },

  header: {
    position: "relative",
    padding: "60px 24px 40px",
    overflow: "hidden",
  },
  headerBg: {
    position: "absolute",
    inset: 0,
    background: "radial-gradient(ellipse 60% 60% at 30% 50%, rgba(239,68,68,0.1) 0%, transparent 70%)",
  },
  headerContent: {
    maxWidth: "700px",
    position: "relative",
    zIndex: 1,
  },
  headerBadge: {
    display: "inline-block",
    padding: "5px 14px",
    background: "rgba(239,68,68,0.12)",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: "100px",
    fontSize: "13px",
    color: "#fca5a5",
    fontWeight: "500",
    marginBottom: "16px",
  },
  headerTitle: {
    fontSize: "clamp(28px,4vw,48px)",
    fontWeight: "900",
    color: "#f8fafc",
    letterSpacing: "-1.5px",
    marginBottom: "12px",
  },
  headerSub: {
    fontSize: "16px",
    color: "#64748b",
    lineHeight: "1.6",
  },

  layout: {
    maxWidth: "1280px",
    margin: "0 auto",
    padding: "0 24px",
    display: "grid",
    gridTemplateColumns: "380px 1fr",
    gap: "24px",
  },

  leftPanel: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },

  statsRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: "12px",
  },
  statBox: {
    background: "rgba(14,14,22,0.9)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "12px",
    padding: "14px",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  statNum: { fontSize: "28px", fontWeight: "800" },
  statLbl: { fontSize: "11px", color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px" },

  card: {
    background: "rgba(14,14,22,0.9)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "16px",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "18px",
  },
  cardTitle: { fontSize: "18px", fontWeight: "700", color: "#f1f5f9", margin: 0 },

  gpsSection: { display: "flex", flexDirection: "column", gap: "10px" },
  coordRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" },
  coordField: { display: "flex", flexDirection: "column", gap: "6px" },
  label: { fontSize: "12px", color: "#64748b", fontWeight: "500", textTransform: "uppercase", letterSpacing: "0.5px" },
  input: {
    padding: "10px 12px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "8px",
    color: "#e2e8f0",
    fontSize: "14px",
    outline: "none",
    width: "100%",
  },

  gpsBtn: {
    padding: "11px",
    background: "rgba(99,102,241,0.1)",
    border: "1px solid rgba(99,102,241,0.3)",
    borderRadius: "10px",
    color: "#a5b4fc",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 0.2s",
    width: "100%",
  },
  gpsBtnLoading: { opacity: 0.7, cursor: "wait" },

  dropzone: {
    border: "2px dashed rgba(255,255,255,0.1)",
    borderRadius: "12px",
    padding: "32px 20px",
    textAlign: "center",
    cursor: "pointer",
    transition: "all 0.2s",
    position: "relative",
    overflow: "hidden",
    background: "rgba(255,255,255,0.02)",
  },
  dropzoneActive: {
    border: "2px dashed rgba(99,102,241,0.6)",
    background: "rgba(99,102,241,0.05)",
  },
  dropzoneWithPreview: { padding: 0, border: "2px solid rgba(99,102,241,0.4)" },
  dropIcon: { fontSize: "36px", marginBottom: "10px" },
  dropTitle: { color: "#94a3b8", fontSize: "14px", fontWeight: "500", marginBottom: "4px" },
  dropSub: { color: "#475569", fontSize: "12px" },
  preview: { width: "100%", height: "180px", objectFit: "cover", display: "block" },
  previewOverlay: {
    position: "absolute",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: 0,
    transition: "opacity 0.2s",
  },
  previewOverlayText: { color: "#fff", fontSize: "14px", fontWeight: "600" },
  fileName: { fontSize: "13px", color: "#64748b", margin: "-8px 0" },

  submitBtn: {
    padding: "14px",
    background: "linear-gradient(135deg, #ef4444, #dc2626)",
    border: "none",
    borderRadius: "12px",
    color: "#fff",
    fontSize: "15px",
    fontWeight: "700",
    cursor: "pointer",
    boxShadow: "0 4px 15px rgba(239,68,68,0.35)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    transition: "all 0.2s",
  },
  submitBtnLoading: { opacity: 0.8, cursor: "wait" },
  btnSpinner: {
    width: "16px",
    height: "16px",
    border: "2px solid rgba(255,255,255,0.3)",
    borderTop: "2px solid #fff",
    borderRadius: "50%",
    animation: "spin 0.7s linear infinite",
    display: "inline-block",
  },

  infoBox: {
    padding: "12px 14px",
    background: "rgba(99,102,241,0.06)",
    border: "1px solid rgba(99,102,241,0.15)",
    borderRadius: "10px",
  },
  infoText: { fontSize: "13px", color: "#64748b", lineHeight: "1.6", margin: 0 },

  mapPanel: { minHeight: "600px" },
  mapCard: {
    background: "rgba(14,14,22,0.9)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "16px",
    overflow: "hidden",
    height: "100%",
    display: "flex",
    flexDirection: "column",
  },
  mapHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
  },
  mapTitle: { fontSize: "15px", fontWeight: "700", color: "#f1f5f9" },
  mapLegend: { display: "flex", alignItems: "center", fontSize: "13px", color: "#64748b" },
  legendDot: (color) => ({
    display: "inline-block",
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    background: color === "red" ? "#ef4444" : "#eab308",
    marginRight: "6px",
  }),
  mapBody: { flex: 1, minHeight: "560px" },
  mapPlaceholder: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  mapLoader: {
    width: "36px",
    height: "36px",
    border: "3px solid rgba(99,102,241,0.2)",
    borderTop: "3px solid #6366f1",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },

  infoWindow: {
    background: "#0d1117",
    color: "#f1f5f9",
    borderRadius: "8px",
    padding: "12px",
    minWidth: "200px",
    fontFamily: "Inter, sans-serif",
  },
  infoWinBadge: {
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: "6px",
    fontSize: "11px",
    fontWeight: "700",
    marginBottom: "8px",
  },
  infoWinLabel: { fontSize: "13px", marginBottom: "4px", color: "#94a3b8" },
  infoWinImg: {
    width: "100%",
    height: "100px",
    objectFit: "cover",
    borderRadius: "6px",
    marginTop: "8px",
  },
};