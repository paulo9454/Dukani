import { useEffect, useState } from "react";
import API from "../api/client";
import { toast } from "../utils/toast";

/**
 * PlanBadge — compact "Your plan" chip for the owner header.
 *
 * Reads `/api/owner/shops` (already paginated owner-scoped) and picks the
 * most-urgent subscription across the owner's shops:
 *
 *   1) expired  → red, "Expired · Renew"
 *   2) <= 7 d   → red, "<plan> · Xd left"
 *   3) <= 14 d  → amber, "<plan> · Xd left"
 *   4) active   → green, "<plan> · Xd left"
 *   5) none     → gray, "No active plan · Activate"
 *
 * One-tap: clicking the chip kicks off `/api/owner/shops/{id}/subscribe`
 * (POS Online) for the chosen shop and redirects to Paystack.
 */
const PLAN_LABEL = {
  pos: "POS",
  pos_online: "POS Online",
};

function daysUntil(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / (24 * 60 * 60 * 1000));
}

function pickMostUrgent(shops) {
  if (!Array.isArray(shops) || shops.length === 0) return null;
  // Map each shop to a "state" row we can sort.
  const rows = shops.map((s) => {
    const plan = s.subscription_plan || null;
    const end = s.subscription_end || null;
    const status = s.subscription_status || null;
    const active = plan && status === "active";
    const d = daysUntil(end);
    return { shop: s, plan, end, status, active, daysLeft: d };
  });
  // Priority: expired > expiring soon > healthy > none.
  rows.sort((a, b) => {
    const score = (r) => {
      if (!r.active) return -1; // no plan — least info
      if (r.daysLeft == null) return 0;
      if (r.daysLeft <= 0) return 100;
      return 50 - Math.min(r.daysLeft, 50);
    };
    return score(b) - score(a);
  });
  return rows[0];
}

export default function PlanBadge({ testId = "plan-badge" }) {
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    API.get("/api/owner/shops")
      .then((r) => {
        if (cancelled) return;
        setRow(pickMostUrgent(r.data || []));
      })
      .catch(() => {
        /* non-fatal — hide badge */
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !row) return null;
  // No shops at all → don't clutter header.
  if (!row.shop) return null;

  const { plan, active, daysLeft, shop } = row;

  let variant = "muted"; // gray
  let label;
  let cta;

  if (!active) {
    variant = "muted";
    label = "No active plan";
    cta = "Activate";
  } else if (daysLeft != null && daysLeft <= 0) {
    variant = "danger";
    label = "Expired";
    cta = "Renew";
  } else if (daysLeft != null && daysLeft <= 7) {
    variant = "danger";
    label = `${PLAN_LABEL[plan] || plan} · ${daysLeft}d left`;
    cta = "Renew";
  } else if (daysLeft != null && daysLeft <= 14) {
    variant = "warn";
    label = `${PLAN_LABEL[plan] || plan} · ${daysLeft}d left`;
    cta = "Renew";
  } else {
    variant = "ok";
    label = daysLeft != null
      ? `${PLAN_LABEL[plan] || plan} · ${daysLeft}d left`
      : `${PLAN_LABEL[plan] || plan}`;
    cta = null; // healthy — no CTA, just a chip
  }

  const styles = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    minHeight: 32,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid",
    whiteSpace: "nowrap",
  };
  const palette = {
    ok: { background: "#dcfce7", color: "#15803d", borderColor: "#86efac" },
    warn: { background: "#fef3c7", color: "#92400e", borderColor: "#fcd34d" },
    danger: { background: "#fee2e2", color: "#991b1b", borderColor: "#fca5a5" },
    muted: { background: "#f1f5f9", color: "#334155", borderColor: "#e2e8f0" },
  };

  const renew = async () => {
    if (busy) return;
    try {
      setBusy(true);
      // Default to the existing plan, or pos_online if none.
      const targetPlan = plan || "pos_online";
      const res = await API.post(`/api/owner/shops/${shop._id}/subscribe`, {
        plan: targetPlan,
        callback_url: `${window.location.origin}/owner?sub=verify`,
      });
      if (res.data?.activated) {
        toast("✅ Plan activated", { variant: "success" });
        setTimeout(() => window.location.reload(), 800);
      } else if (res.data?.authorization_url) {
        toast("Redirecting to Paystack…");
        window.location.href = res.data.authorization_url;
      } else {
        toast("Could not start payment — try again.");
      }
    } catch (err) {
      toast(err?.response?.data?.detail || "Failed to start renewal");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid={testId}
      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
    >
      <span style={{ ...styles, ...palette[variant] }} title={shop.name}>
        <span aria-hidden="true">●</span>
        {label}
      </span>
      {cta && (
        <button
          data-testid={`${testId}-renew`}
          onClick={renew}
          disabled={busy}
          style={{
            padding: "6px 12px",
            minHeight: 32,
            background: variant === "danger" ? "#0f172a" : "#16a34a",
            color: "white",
            border: "none",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            cursor: busy ? "wait" : "pointer",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? "…" : cta}
        </button>
      )}
    </div>
  );
}
