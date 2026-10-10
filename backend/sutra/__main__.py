"""CLI entry point for SŪTRA (`python -m sutra`)."""

import sys
import uvicorn

from sutra.config import settings
from sutra.db import Database


def main() -> None:
    args = sys.argv[1:]
    db = Database(settings.DATABASE_PATH)

    if args and args[0] == "pair":
        code = db.create_pairing_code(ttl_seconds=300)
        print("\n" + "=" * 54)
        print(f"🔑 SŪTRA ONE-TIME PAIRING CODE: {code}")
        print("• Validity: 5 minutes (single use)")
        print(f"• In Telegram, send to your bot: /pair {code}")
        print("=" * 54 + "\n")
        return

    # Default action: run the supervisor server
    print(f"[SŪTRA] Launching supervisor backend on {settings.HOST}:{settings.PORT}...")
    uvicorn.run(
        "sutra.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=False,
    )


if __name__ == "__main__":
    main()
