from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from collections import defaultdict, deque
from time import time

RATE_LIMIT_HITS = defaultdict(deque)


def reset_rate_limits():
    RATE_LIMIT_HITS.clear()


class RateLimiterMiddleware(BaseHTTPMiddleware):
    def _limit_for(self, path: str):
        if path.startswith("/api/auth/login"):
            return 5, 60
        if path.startswith("/api/orders/checkout"):
            return 10, 60
        if path.startswith("/api/customer"):
            return 30, 60
        return None

    async def dispatch(self, request, call_next):
        rule = self._limit_for(request.url.path)
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
            return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"})

        q.append(now)
        return await call_next(request)
