from fastapi import HTTPException


def safe_str(value: str, field: str = "value") -> str:
    if not isinstance(value, str):
        raise HTTPException(status_code=400, detail=f"{field} must be a string")
    if "$" in value or "\x00" in value:
        raise HTTPException(status_code=400, detail=f"Unsafe input for {field}")
    return value


def safe_dict(payload: dict):
    for key in payload.keys():
        if isinstance(key, str) and key.startswith("$"):
            raise HTTPException(status_code=400, detail="Unsafe query operator")
    return payload
