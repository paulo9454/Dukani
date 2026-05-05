import { useEffect, useRef, useState } from "react";
import { productImage, resolveImageUrl } from "../utils/imageUrl";

/**
 * ProductImage — reliable, accessible image for products.
 *
 *  • Resolves legacy/preview/prod URLs through resolveImageUrl()
 *  • Shows a neutral skeleton while loading
 *  • Shows a friendly placeholder on error or when no src is given
 *  • lazy + async decoding for performance
 */
export default function ProductImage({
  product,
  src,
  alt = "",
  height = 140,
  width = "100%",
  rounded = false,
  style = {},
  className = "",
  testId,
  loading = "lazy",
}) {
  const resolved = product ? productImage(product) : resolveImageUrl(src);
  const [status, setStatus] = useState(resolved ? "loading" : "none");
  const imgRef = useRef(null);

  // Handle cached images — onLoad may not fire if the browser already has
  // the image cached when the component mounts.
  useEffect(() => {
    if (!resolved) return;
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) {
      setStatus("loaded");
    }
  }, [resolved]);

  const box = {
    width,
    height,
    borderRadius: rounded ? "50%" : 8,
    background: "#f1f5f9",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
    ...style,
  };

  if (!resolved || status === "error") {
    return (
      <div
        style={box}
        className={className}
        data-testid={testId}
        aria-label={alt || "No image available"}
      >
        <div style={{ textAlign: "center", color: "#64748b", padding: 8 }}>
          <div style={{ fontSize: 24, lineHeight: 1 }}>🖼️</div>
          <div style={{ fontSize: 11, marginTop: 4, fontWeight: 500 }}>
            No image
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={box} className={className} data-testid={testId}>
      {status === "loading" && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)",
            backgroundSize: "200% 100%",
            animation: "dukayko-shimmer 1.2s infinite",
          }}
        />
      )}
      <img
        ref={imgRef}
        src={resolved}
        alt={alt}
        loading={loading}
        decoding="async"
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
          opacity: status === "loaded" ? 1 : 0,
          transition: "opacity 150ms ease",
        }}
      />
    </div>
  );
}
