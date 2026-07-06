import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";

const NAV_LINKS = [
  { to: "/", label: "Live Feed", icon: "🌍" },
  { to: "/help", label: "Report Disaster", icon: "🚨" },
  { to: "/ngo", label: "NGO Dashboard", icon: "🏥" },
];

export default function Navbar() {
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  return (
    <>
      <nav style={{ ...styles.nav, ...(scrolled ? styles.navScrolled : {}) }}>
        <div style={styles.inner}>
          {/* Logo */}
          <Link to="/" style={styles.logo}>
            <span style={styles.logoIcon}>🛟</span>
            <span>
              <span style={styles.logoRescue}>ResCue</span>
              <span style={styles.logoAi}> AI</span>
            </span>
          </Link>

          {/* Desktop links */}
          <div style={styles.links}>
            {NAV_LINKS.map((link) => {
              const active = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  style={{ ...styles.link, ...(active ? styles.linkActive : {}) }}
                >
                  <span style={styles.linkIcon}>{link.icon}</span>
                  {link.label}
                  {active && <span style={styles.activeDot} />}
                </Link>
              );
            })}
          </div>

          {/* CTA Button */}
          <Link to="/help" style={styles.ctaButton}>
            <span>⚡</span> Report Now
          </Link>

          {/* Mobile hamburger */}
          <button
            style={styles.hamburger}
            onClick={() => setMobileOpen((p) => !p)}
            aria-label="Toggle menu"
          >
            <span style={{ ...styles.bar, ...(mobileOpen ? styles.bar1Open : {}) }} />
            <span style={{ ...styles.bar, ...(mobileOpen ? styles.bar2Open : {}) }} />
            <span style={{ ...styles.bar, ...(mobileOpen ? styles.bar3Open : {}) }} />
          </button>
        </div>

        {/* Mobile dropdown */}
        {mobileOpen && (
          <div style={styles.mobileMenu}>
            {NAV_LINKS.map((link) => {
              const active = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  style={{ ...styles.mobileLink, ...(active ? styles.mobileLinkActive : {}) }}
                >
                  <span>{link.icon}</span> {link.label}
                </Link>
              );
            })}
          </div>
        )}
      </nav>
      {/* Spacer so page content doesn't go under fixed nav */}
      <div style={{ height: "68px" }} />
    </>
  );
}

const styles = {
  nav: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    background: "rgba(10, 10, 15, 0.7)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    transition: "all 0.3s ease",
  },
  navScrolled: {
    background: "rgba(10, 10, 15, 0.95)",
    boxShadow: "0 4px 30px rgba(0,0,0,0.4)",
  },
  inner: {
    maxWidth: "1280px",
    margin: "0 auto",
    padding: "0 24px",
    height: "68px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "24px",
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    textDecoration: "none",
    flexShrink: 0,
  },
  logoIcon: {
    fontSize: "28px",
    filter: "drop-shadow(0 0 8px rgba(99,102,241,0.6))",
  },
  logoRescue: {
    fontSize: "20px",
    fontWeight: "800",
    background: "linear-gradient(135deg, #6366f1, #a855f7)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    letterSpacing: "-0.5px",
  },
  logoAi: {
    fontSize: "20px",
    fontWeight: "800",
    color: "#e2e8f0",
    letterSpacing: "-0.5px",
  },
  links: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    flex: 1,
    justifyContent: "center",
  },
  link: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 16px",
    borderRadius: "10px",
    fontSize: "14px",
    fontWeight: "500",
    color: "#94a3b8",
    textDecoration: "none",
    transition: "all 0.2s ease",
    position: "relative",
    cursor: "pointer",
  },
  linkActive: {
    color: "#ffffff",
    background: "rgba(99,102,241,0.15)",
    border: "1px solid rgba(99,102,241,0.3)",
  },
  linkIcon: {
    fontSize: "16px",
  },
  activeDot: {
    position: "absolute",
    bottom: "4px",
    left: "50%",
    transform: "translateX(-50%)",
    width: "4px",
    height: "4px",
    borderRadius: "50%",
    background: "#6366f1",
  },
  ctaButton: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "9px 20px",
    background: "linear-gradient(135deg, #6366f1, #a855f7)",
    borderRadius: "10px",
    fontSize: "14px",
    fontWeight: "600",
    color: "#fff",
    textDecoration: "none",
    flexShrink: 0,
    boxShadow: "0 4px 15px rgba(99,102,241,0.4)",
    transition: "all 0.2s ease",
  },
  hamburger: {
    display: "none",
    flexDirection: "column",
    gap: "5px",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "4px",
  },
  bar: {
    display: "block",
    width: "24px",
    height: "2px",
    background: "#94a3b8",
    borderRadius: "2px",
    transition: "all 0.3s ease",
  },
  bar1Open: { transform: "rotate(45deg) translate(5px, 5px)" },
  bar2Open: { opacity: 0 },
  bar3Open: { transform: "rotate(-45deg) translate(5px, -5px)" },
  mobileMenu: {
    display: "flex",
    flexDirection: "column",
    padding: "12px 24px 20px",
    background: "rgba(10,10,15,0.98)",
    borderTop: "1px solid rgba(255,255,255,0.05)",
    gap: "4px",
  },
  mobileLink: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px 16px",
    borderRadius: "10px",
    fontSize: "15px",
    fontWeight: "500",
    color: "#94a3b8",
    textDecoration: "none",
  },
  mobileLinkActive: {
    color: "#ffffff",
    background: "rgba(99,102,241,0.15)",
  },
};
