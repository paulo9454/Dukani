import ProductImage from "../components/ProductImage";
import InstallButton from "../components/InstallButton";

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
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <InstallButton testId="landing-install-btn" />
          <button
            onClick={signIn}
            data-testid="landing-signin"
            style={ghostBtn}
          >
            Sign in
          </button>
        </div>
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

      {/* ═══ 2. Dual showcase — POS + Online ═══ */}
      <section style={dualSection}>
        <h2 style={dualH2}>Run your shop. Sell online.</h2>
        <p style={dualSub}>
          Use Dukayko to record sales in your shop and let customers order
          online — all in one place.
        </p>

        <div style={dualGrid}>
          {DEMO_SHOPS.map((shop) => (
            <DualShopCard key={shop.slug} shop={shop} />
          ))}
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
// Dual shop card — POS view (left) + Online view (right)
// ============================================================
function DualShopCard({ shop }) {
  return (
    <article style={dualCard} data-testid={`demo-shop-${shop.slug}`}>
      {/* Shop header */}
      <header style={dualCardHeader}>
        <div>
          <div style={dualCardCategory}>{shop.category}</div>
          <h3 style={dualCardName}>{shop.name}</h3>
        </div>
        <a
          href={`/shop/${shop.slug}`}
          target="_blank"
          rel="noreferrer"
          style={dualCardCta}
          data-testid={`demo-shop-${shop.slug}-cta`}
        >
          View shop&nbsp;→
        </a>
      </header>

      <p style={dualCardSupport}>{shop.support}</p>

      {/* Online customer view */}
      <section style={onlinePanel} aria-label={`${shop.name} online customer view`}>
        <div style={panelLabel}>
          <span style={panelLabelDot("#16a34a")} /> Online (customer view)
        </div>
        <div style={onlineScreen}>
          <div style={onlineUrlBar}>dukayko.com/shop/{shop.slug}</div>
          <div style={onlineGrid}>
            {shop.products.map((p) => (
              <div key={p.name} style={onlineProductCard}>
                <div style={onlineImageWrap}>
                  <ProductImage src={p.image} alt={p.name} height={120} loading="eager" />
                </div>
                <div style={onlineProductName}>{p.name}</div>
                <div style={onlineProductPrice}>
                  KES {p.price.toLocaleString()}
                </div>
                <button type="button" style={onlineAddBtn}>
                  + Add to cart
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </article>
  );
}

// ============================================================
// Data
// ============================================================
const DEMO_SHOPS = [
  {
    slug: "electro-mart",
    name: "ElectroMart Kenya",
    category: "📺 Electronics · Nairobi CBD",
    support:
      "Customers browse and order online — no app, no friction.",
    products: [
      {
        name: 'GLD 32" LED TV',
        price: 16500,
        qty: 1,
        image:
          "https://customer-assets.emergentagent.com/job_dukani-store/artifacts/qjqqenkw_tv.jpg",
      },
      {
        name: 'GLD 43" Smart TV',
        price: 24500,
        qty: 1,
        image:
          "https://customer-assets.emergentagent.com/job_dukani-store/artifacts/zpnv0h81_gld%20tv.jpg",
      },
      {
        name: 'GLD 50" Android TV',
        price: 39999,
        qty: 1,
        image:
          "https://customer-assets.emergentagent.com/job_dukani-store/artifacts/hldmm6yj_2.jpg",
      },
    ],
  },
  {
    slug: "urban-heels",
    name: "Urban Heels & Fashion",
    category: "👜 Ladies Fashion · Westlands",
    support: "Open a beautiful online store — share the link, take orders.",
    products: [
      {
        name: "Rose Embroidered Sneakers",
        price: 2500,
        qty: 1,
        image:
          "https://customer-assets.emergentagent.com/job_dukani-store/artifacts/v4noxurf_1%20%282%29.jpg",
      },
      {
        name: "Brown Suede Loafers",
        price: 3200,
        qty: 1,
        image:
          "https://customer-assets.emergentagent.com/job_dukani-store/artifacts/xpv0shlk_1%20%283%29.jpg",
      },
      {
        name: "Black Leather Backpack",
        price: 1800,
        qty: 1,
        image:
          "https://customer-assets.emergentagent.com/job_dukani-store/artifacts/n08geygr_1%20%286%29.jpg",
      },
      {
        name: "Canvas Messenger Bag",
        price: 1200,
        qty: 1,
        image:
          "https://customer-assets.emergentagent.com/job_dukani-store/artifacts/5q3y7rlf_1%20%287%29.jpg",
      },
    ],
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

// ── Dual-shop showcase (POS + Online) ──
const dualSection = {
  maxWidth: 1200,
  margin: "16px auto 56px",
  padding: "0 20px",
};

const dualH2 = {
  fontSize: "clamp(26px, 4.2vw, 38px)",
  fontWeight: 800,
  letterSpacing: "-0.02em",
  textAlign: "center",
  margin: "0 auto 8px",
  color: "#0f172a",
  maxWidth: 720,
  lineHeight: 1.1,
};

const dualSub = {
  textAlign: "center",
  color: "#475569",
  fontSize: "clamp(14px, 1.6vw, 17px)",
  margin: "0 auto 36px",
  maxWidth: 620,
  lineHeight: 1.55,
};

const dualGrid = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 28,
};

const dualCard = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 20,
  padding: "24px clamp(16px, 3vw, 28px)",
  boxShadow: "0 18px 40px rgba(15,23,42,0.06)",
  transition: "transform 200ms ease, box-shadow 200ms ease",
};

const dualCardHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
};

const dualCardCategory = {
  fontSize: 12,
  fontWeight: 600,
  color: "#16a34a",
  letterSpacing: 0.2,
  marginBottom: 4,
};

const dualCardName = {
  margin: 0,
  fontSize: "clamp(20px, 2.4vw, 26px)",
  fontWeight: 800,
  color: "#0f172a",
  letterSpacing: "-0.01em",
};

const dualCardCta = {
  alignSelf: "center",
  padding: "10px 18px",
  background: "#0f172a",
  color: "#fff",
  borderRadius: 999,
  textDecoration: "none",
  fontWeight: 700,
  fontSize: 13,
  whiteSpace: "nowrap",
  transition: "transform 120ms ease, background 120ms ease",
};

const dualCardSupport = {
  margin: "10px 0 22px",
  color: "#475569",
  fontSize: 14,
};

const panelLabel = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
  fontWeight: 700,
  color: "#334155",
  letterSpacing: 0.4,
  textTransform: "uppercase",
  marginBottom: 10,
};

const panelLabelDot = (color) => ({
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: color,
});

// Online panel
const onlinePanel = {
  display: "flex",
  flexDirection: "column",
};

const onlineScreen = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 14,
  flex: 1,
};

const onlineUrlBar = {
  fontSize: 11,
  color: "#64748b",
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 6,
  padding: "5px 10px",
  marginBottom: 12,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

const onlineGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 14,
};

const onlineProductCard = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: 8,
  display: "flex",
  flexDirection: "column",
};

const onlineImageWrap = {
  borderRadius: 8,
  overflow: "hidden",
  marginBottom: 6,
  background: "#f1f5f9",
};

const onlineProductName = {
  fontSize: 12,
  fontWeight: 600,
  color: "#0f172a",
  lineHeight: 1.3,
  minHeight: 32,
  whiteSpace: "normal",
};

const onlineProductPrice = {
  fontSize: 13,
  fontWeight: 700,
  color: "#15803d",
  margin: "4px 0 6px",
};

const onlineAddBtn = {
  marginTop: "auto",
  padding: "6px 8px",
  background: "#16a34a",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  fontWeight: 700,
  fontSize: 11,
  cursor: "pointer",
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
