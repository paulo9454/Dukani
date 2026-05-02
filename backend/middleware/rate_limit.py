from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from collections import defaultdict, deque
from time import time

RATE_LIMIT_HITS = defaultdict(deque)


def reset_rate_limits():
    RATE_LIMIT_HITS.clear()


class RateLimiterMiddleware(BaseHTTPMiddleware):
    """Sliding-window IP rate limiter. Rules below match the launch spec."""

    def _limit_for(self, path: str, method: str):
        if method == "OPTIONS":
            return None  # never rate-limit CORS preflights
        # Auth
        if path.startswith("/api/auth/register"):
            return 5, 60
        if path.startswith("/api/auth/login"):
            return 10, 60
        if path.startswith("/api/auth/verify-email") or path.startswith("/api/auth/resend-verification"):
            return 10, 60
        # Payments — keep the M-Pesa callback uncapped (Daraja can retry hard).
        if path.startswith("/api/payments/mpesa/callback") or path.startswith("/api/payments/paystack/webhook"):
            return None
        if path.startswith("/api/payments/"):
            return 10, 60
        # Orders
        if path.startswith("/api/orders/create"):
            return 10, 60
        if path.startswith("/api/orders/checkout"):
            return 10, 60
        # Marketplace
        if path.startswith("/api/customer"):
            return 30, 60
        return None

    async def dispatch(self, request, call_next):
        rule = self._limit_for(request.url.path, request.method)
        if not rule:
            return await call_next(request)

        limit, window = rule
        identifier = request.client.host if request.client else "anon"
        key = f"{identifier}:{request.url.path}"
        now = time()
        q = RATE_LIMIT_HITS[key]
        while q and now - q[0] > window:
            q.popleft()

        if len(q) >= limit:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": f"Too many requests. Try again in a minute.",
                    "limit": limit,
                    "window_sec": window,
                },
                headers={"Retry-After": str(window)},
            )

        q.append(now)
        return await call_next(request)
