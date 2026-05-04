from pydantic import BaseModel
from dotenv import load_dotenv
import logging
import os
from pathlib import Path

# ✅ ALWAYS load correct .env from project root
BASE_DIR = Path(__file__).resolve().parents[2]
ENV_PATH = BASE_DIR / ".env"

load_dotenv(dotenv_path=ENV_PATH, override=False)

_log = logging.getLogger("dukayko.settings")


def _int_env(name: str, default: int) -> int:
    """Coerce an env var to int. If the value is malformed (e.g. someone
    pasted a Paystack secret into the wrong slot at deploy time), fall back
    to the default and log a clear warning instead of crashing the whole
    backend at import time."""
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        _log.error(
            "Env var %s=%r is not a valid integer — falling back to %s. "
            "Check your deployment configuration.",
            name, raw, default,
        )
        return default


class Settings(BaseModel):
    mongo_url: str = os.getenv("MONGO_URL", "mongodb://localhost:27017")
    db_name: str = os.getenv("DB_NAME", "dukani")
    jwt_secret: str = os.getenv("JWT_SECRET", "dev-secret")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    access_token_expire_minutes: int = _int_env("ACCESS_TOKEN_EXPIRE_MINUTES", 30)
    refresh_token_expire_minutes: int = _int_env("REFRESH_TOKEN_EXPIRE_MINUTES", 10080)
    frontend_origins: list[str] = os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")


settings = Settings()
