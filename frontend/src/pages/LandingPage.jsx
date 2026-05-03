import { useState } from "react";
import ProductImage from "../components/ProductImage";

/**
 * Dukayko landing page — minimalist, product-first, mobile-first.
 * Single conversion goal: "Create your shop" → /register.
 */
export default function LandingPage() {
  const go = () => {
    window.location.href = "/register";
  };
  const signIn = () => {
    window.location.href = "/login";
  };

  return (
    <div style={page}>
      {/* ═══ Top bar ═══ */}
      <header style={topbar}>
        <div style={brand}>
          <img
            src="/dukayko-logo.jpg"
            alt="Dukayko"
            width={28}
            height={28}
            style={{ borderRadius: 6 }}
          />
          <b style={{ color: "#0f172a", letterSpacing: -0.2 }}>Dukayko</b>
        </div>
        <button
          onClick={signIn}
          data-testid="landing-signin"
          style={ghostBtn}
        >
          Sign in
        </button>
      </header>

      {/* ═══ 1. Hero ═══ */}
      <section style={hero}>
        <h1 style={h1}>
          Sell online with M-Pesa <br style={{ display: "none" }} />
          <span style={{ color: "#16a34a" }}>in minutes.</span>
        </h1>
        <p style={subhead}>
          Create your shop, share your link, and start receiving orders
          instantly.
        </p>
        <button onClick={go} data-testid="hero-cta" style={primaryBtn}>
          Create your shop →
        </button>
        <p style={helper}>
          No setup fees&nbsp;·&nbsp;Works on your phone&nbsp;·&nbsp;No coding
          required
        </p>
      </section>

      {/* ═══ 2. Live shop preview ═══ */}
      <section style={previewSection}>
        <div style={browserFrame}>
          <div style={browserBar}>
            <span style={dot("#ef4444")} />
            <span style={dot("#f59e0b")} />
            <span style={dot("#22c55e")} />
            <div style={urlBar}>dukayko.com/shop/mkenya-shop</div>
          </div>

          <div style={shopBody}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ margin: 0, color: "#0f172a", fontSize: 18 }}>
                Mkenya Shop
              </h3>
              <div style={{ color: "#475569", fontSize: 12, marginBottom: 12 }}>
                📂 Groceries · 📍 Nairobi
              </div>

              <div style={productGrid}>
                {DEMO_PRODUCTS.map((p) => (
                  <DemoProductCard key={p.name} p={p} />
                ))}
              </div>
            </div>

            <aside style={cartCard}>
              <div style={{ fontWeight: 700, color: "#0f172a" }}>
                🛒 Cart&nbsp;(2)
              </div>
              <div style={{ fontSize: 13, color: "#334155", marginTop: 6 }}>
                1 × Bread · KES 60
                <br />1 × Blue Band · KES 180
              </div>
              <div
                style={{
                  marginTop: 10,
                  paddingTop: 10,
                  borderTop: "1px dashed #cbd5e1",
                  fontWeight: 700,
                  color: "#0f172a",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>Total</span>
                <span>KES 240</span>
              </div>
              <div style={fakeMpesaBtn}>🟢 Pay with M-Pesa</div>
            </aside>
          </div>
        </div>
      </section>

      {/* ═══ 3. How it works ═══ */}
      <section style={section}>
        <h2 style={h2}>How it works</h2>
        <div style={stepsWrap}>
          {STEPS.map((s, i) => (
            <div key={s.title} style={stepCard}>
              <div style={stepIndex}>{i + 1}</div>
              <div style={stepIcon}>{s.icon}</div>
              <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 16 }}>
                {s.title}
              </div>
              <div style={{ color: "#475569", fontSize: 14, marginTop: 4 }}>
                {s.body}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ 4. Feature proof ═══ */}
      <section style={section}>
        <div style={featureGrid}>
          {FEATURES.map((f) => (
            <div key={f.title} style={featureRow}>
              <div style={featureCheck}>✓</div>
              <div>
                <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 15 }}>
                  {f.title}
                </div>
                <div style={{ color: "#475569", fontSize: 13 }}>{f.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ 5. Trust ═══ */}
      <section style={{ ...section, textAlign: "center" }}>
        <p style={{ color: "#334155", fontSize: 14, margin: 0 }}>
          Built for small businesses in Kenya using M-Pesa.
        </p>
        <div
          style={{
            marginTop: 10,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            justifyContent: "center",
            color: "#64748b",
            fontSize: 12,
          }}
        >
          <span style={pill}>🟢 M-Pesa Daraja</span>
          <span style={pill}>🔒 Secure checkout</span>
          <span style={pill}>📱 Mobile-first</span>
        </div>
      </section>

      {/* ═══ 6. Final CTA ═══ */}
      <section style={finalCta}>
        <h2 style={{ ...h2, margin: 0, color: "#fff" }}>
          Start selling in 5 minutes.
        </h2>
        <p style={{ color: "#cbd5e1", marginTop: 8 }}>
          Your shop link will be ready the moment you sign up.
        </p>
        <button
          onClick={go}
          data-testid="final-cta"
          style={{
            ...primaryBtn,
            marginTop: 12,
            background: "#16a34a",
            color: "#fff",
          }}
        >
          Create your shop →
        </button>
      </section>

      {/* ═══ Footer ═══ */}
      <footer style={footer}>
        <span>© {new Date().getFullYear()} Dukayko</span>
        <a href="/login" style={footerLink}>
          Sign in
        </a>
      </footer>
    </div>
  );
}

// ============================================================
// Demo product card — standalone so the landing page has zero
// dependency on owner-side stores / data.
// ============================================================
function DemoProductCard({ p }) {
  const [added, setAdded] = useState(false);
  return (
    <div style={productCard}>
      <ProductImage src={p.image} alt={p.name} height={90} />
      <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 14, marginTop: 6 }}>
        {p.name}
      </div>
      <div style={{ color: "#15803d", fontWeight: 700, fontSize: 13 }}>
        KES {p.price}
      </div>
      <button
        onClick={() => setAdded((a) => !a)}
        style={{
          marginTop: 6,
          width: "100%",
          padding: "8px 10px",
          minHeight: 38,
          background: added ? "#dcfce7" : "#16a34a",
          color: added ? "#15803d" : "#fff",
          border: "none",
          borderRadius: 8,
          fontWeight: 700,
          fontSize: 13,
          cursor: "pointer",
          transition: "background 120ms ease, color 120ms ease",
        }}
      >
        {added ? "✓ Added" : "+ Add to cart"}
      </button>
    </div>
  );
}

// ============================================================
// Data
// ============================================================
const DEMO_PRODUCTS = [
  {
    name: "Bread",
    price: 60,
    image:
      "https://customer-assets.emergentagent.com/job_dukani-store/artifacts/f9nb6m43_bread.webp",
  },
  {
    name: "Milk 1L",
    price: 90,
    image:
      "https://customer-assets.emergentagent.com/job_dukani-store/artifacts/ugn04rpi_milk.webp",
  },
  {
    name: "Blue Band",
    price: 180,
    image:
      "https://customer-assets.emergentagent.com/job_dukani-store/artifacts/rm5npbiy_blueband.webp",
  },
];

const STEPS = [
  {
    icon: "🏪",
    title: "Create your shop",
    body: "Sign up, give your shop a name, pick a slug.",
  },
  {
    icon: "📦",
    title: "Add products",
    body: "Upload photos, set prices, mark stock.",
  },
  {
    icon: "📲",
    title: "Share on WhatsApp",
    body: "Send your shop link — customers pay with M-Pesa.",
  },
];

const FEATURES = [
  {
    title: "M-Pesa payments built-in",
    body: "STK push goes straight to your PayBill or Till.",
  },
  {
    title: "Share on WhatsApp easily",
    body: "One clean link per shop — customers just tap and buy.",
  },
  {
    title: "Simple product management",
    body: "Add, edit, restock from your phone in seconds.",
  },
  {
    title: "Track orders in real time",
    body: "Know when someone pays, even while you're behind the counter.",
  },
];

// ============================================================
// Styles
// ============================================================
const page = {
  background: "#fff",
  color: "#0f172a",
  minHeight: "100svh",
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  overflowX: "hidden",
};

const topbar = {
  maxWidth: 1200,
  margin: "0 auto",
  padding: "14px 20px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const brand = { display: "flex", alignItems: "center", gap: 10 };

const ghostBtn = {
  padding: "10px 16px",
  minHeight: 40,
  background: "transparent",
  color: "#0f172a",
  border: "1px solid #e2e8f0",
  borderRadius: 999,
  fontWeight: 600,
  cursor: "pointer",
};

const hero = {
  maxWidth: 820,
  margin: "24px auto 12px",
  padding: "48px 20px 32px",
  textAlign: "center",
};

const h1 = {
  fontSize: "clamp(30px, 6vw, 52px)",
  lineHeight: 1.08,
  margin: 0,
  letterSpacing: "-0.02em",
  color: "#0f172a",
  fontWeight: 800,
};

const subhead = {
  margin: "18px auto 24px",
  maxWidth: 560,
  fontSize: "clamp(15px, 2vw, 18px)",
  color: "#334155",
  lineHeight: 1.55,
};

const primaryBtn = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "14px 26px",
  minHeight: 50,
  background: "#0f172a",
  color: "#fff",
  border: "none",
  borderRadius: 999,
  fontWeight: 800,
  fontSize: 16,
  cursor: "pointer",
  boxShadow: "0 4px 16px rgba(15,23,42,0.18)",
  transition: "transform 120ms ease, box-shadow 120ms ease",
};

const helper = {
  margin: "14px 0 0",
  color: "#475569",
  fontSize: 13,
};

// ── Live shop preview ──
const previewSection = {
  maxWidth: 1080,
  margin: "24px auto 64px",
  padding: "0 20px",
};

const browserFrame = {
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  overflow: "hidden",
  background: "#fff",
  boxShadow: "0 30px 70px rgba(15,23,42,0.12)",
};

const browserBar = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "10px 12px",
  background: "#f8fafc",
  borderBottom: "1px solid #e2e8f0",
};

const dot = (color) => ({
  width: 10,
  height: 10,
  borderRadius: "50%",
  background: color,
  display: "inline-block",
});

const urlBar = {
  marginLeft: 12,
  flex: 1,
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: "4px 10px",
  fontSize: 12,
  color: "#475569",
};

const shopBody = {
  display: "flex",
  gap: 16,
  padding: 16,
  flexWrap: "wrap",
};

const productGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
  gap: 10,
};

const productCard = {
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 10,
  background: "#fff",
};

const productImg = {
  width: "100%",
  height: 90,
  borderRadius: 8,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const cartCard = {
  flex: "0 0 220px",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 14,
  alignSelf: "flex-start",
  minWidth: 180,
};

const fakeMpesaBtn = {
  marginTop: 12,
  padding: "10px 12px",
  background: "#16a34a",
  color: "#fff",
  borderRadius: 8,
  textAlign: "center",
  fontWeight: 700,
  fontSize: 13,
};

// ── Section generic ──
const section = {
  maxWidth: 1100,
  margin: "56px auto",
  padding: "0 20px",
};

const h2 = {
  fontSize: "clamp(22px, 3.5vw, 30px)",
  fontWeight: 800,
  letterSpacing: "-0.01em",
  margin: "0 0 20px",
  color: "#0f172a",
};

// ── Steps ──
const stepsWrap = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};

const stepCard = {
  position: "relative",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 20,
};

const stepIndex = {
  position: "absolute",
  top: 12,
  right: 14,
  fontWeight: 800,
  fontSize: 12,
  color: "#94a3b8",
  letterSpacing: 0.4,
};

const stepIcon = { fontSize: 28, marginBottom: 10 };

// ── Features ──
const featureGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 14,
};

const featureRow = {
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  padding: "12px 4px",
};

const featureCheck = {
  flex: "0 0 26px",
  height: 26,
  borderRadius: "50%",
  background: "#dcfce7",
  color: "#15803d",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 800,
  marginTop: 2,
};

const pill = {
  padding: "4px 10px",
  borderRadius: 999,
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
};

// ── Final CTA ──
const finalCta = {
  maxWidth: 1100,
  margin: "64px auto",
  padding: "48px 20px",
  background: "#0f172a",
  borderRadius: 20,
  textAlign: "center",
};

const footer = {
  maxWidth: 1200,
  margin: "0 auto",
  padding: "20px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  color: "#64748b",
  fontSize: 13,
  borderTop: "1px solid #e2e8f0",
};

const footerLink = { color: "#0f172a", textDecoration: "none", fontWeight: 600 };
