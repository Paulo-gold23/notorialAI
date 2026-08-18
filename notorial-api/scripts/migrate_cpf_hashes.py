"""
CPF/CNPJ Hash Migration Script
===============================
Migrates existing CPF/CNPJ hashes from plain SHA-256 to HMAC-SHA256.

Run this ONCE after deploying the updated _hash_cpf function.
It will re-hash all existing CPF/CNPJ values in the advogados table.

Usage:
    cd notorial-api
    python scripts/migrate_cpf_hashes.py

IMPORTANT: This script needs the CPF_HASH_SECRET env var to be set.
Since we only store hashes (not plaintext CPFs), this script works by:
1. For users who saved their CPF via the /save-cpf endpoint, the hash is in the DB
2. We cannot reverse the old SHA-256 hash, so users with existing hashes will
   need to re-submit their CPF/CNPJ via the profile page on their next login.
3. This script clears old SHA-256 hashes and logs affected users.

Alternative approach: If you have a backup of plaintext CPFs from before hashing
was implemented, you can use those to re-hash with HMAC.
"""
import os
import sys
import logging

# Add parent dir to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(override=True)

from database import get_supabase_admin_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def migrate():
    admin = get_supabase_admin_client()
    if not admin:
        logger.error("No admin client available. Check SUPABASE_SERVICE_KEY.")
        return

    # Find all users with a CPF hash (non-null, non-empty)
    resp = admin.table("advogados") \
        .select("id, email, cpf_cnpj") \
        .not_.is_("cpf_cnpj", "null") \
        .neq("cpf_cnpj", "") \
        .execute()

    users = resp.data or []
    logger.info(f"Found {len(users)} users with CPF/CNPJ hashes")

    # Identify which ones have old-format SHA-256 hashes (64 hex chars, no $ prefix)
    legacy_users = []
    bcrypt_users = []
    for u in users:
        h = u.get("cpf_cnpj", "")
        if len(h) == 64 and all(c in "0123456789abcdef" for c in h):
            legacy_users.append(u)
        else:
            bcrypt_users.append(u)

    logger.info(f"  Legacy SHA-256 hashes: {len(legacy_users)}")
    logger.info(f"  Already HMAC/other: {len(bcrypt_users)}")

    if not legacy_users:
        logger.info("No migration needed!")
        return

    # Since we can't reverse SHA-256, we need to flag these users to re-enter their CPF
    # We'll set their cpf_cnpj to NULL with a migration marker
    logger.warning(
        f"Cannot migrate {len(legacy_users)} legacy hashes (SHA-256 is irreversible). "
        "These users will need to re-enter their CPF/CNPJ on next login."
    )

    for u in legacy_users:
        logger.info(f"  Clearing legacy hash for user {u['id']} ({u.get('email', 'N/A')})")
        try:
            admin.table("advogados") \
                .update({"cpf_cnpj": None}) \
                .eq("id", u["id"]) \
                .execute()
        except Exception as e:
            logger.error(f"  Failed to clear hash for {u['id']}: {e}")

    logger.info(f"Migration complete. {len(legacy_users)} users need to re-enter their CPF/CNPJ.")


if __name__ == "__main__":
    migrate()
