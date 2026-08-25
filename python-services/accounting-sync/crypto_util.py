"""
Token encryption helpers for the accounting-sync service.

All provider OAuth tokens (access + refresh) are encrypted at rest with
AES-256-GCM using the key supplied via the ACCOUNTING_TOKEN_KEY environment
variable (64 hex chars = 32 bytes). Ciphertext format:
    base64( nonce(12 bytes) || ciphertext || tag(16 bytes) )

Fail-closed: if the key is absent or malformed, encrypt/decrypt raise
TokenCryptoNotConfigured and the API layer responds 503
`token_crypto_not_configured`. No plaintext fallback is ever used.
"""

import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class TokenCryptoNotConfigured(Exception):
    """Raised when ACCOUNTING_TOKEN_KEY is missing or not 32-byte hex."""


def _load_key() -> bytes:
    key_hex = os.getenv("ACCOUNTING_TOKEN_KEY", "").strip()
    if not key_hex:
        raise TokenCryptoNotConfigured("ACCOUNTING_TOKEN_KEY is not set")
    try:
        raw = bytes.fromhex(key_hex)
    except ValueError as exc:
        raise TokenCryptoNotConfigured(
            "ACCOUNTING_TOKEN_KEY must be 64 hex characters (32 bytes)"
        ) from exc
    if len(raw) != 32:
        raise TokenCryptoNotConfigured(
            "ACCOUNTING_TOKEN_KEY must decode to exactly 32 bytes"
        )
    return raw


def encrypt_token(plaintext: str) -> str:
    """Encrypt a token string, returning base64(nonce||ciphertext||tag)."""
    key = _load_key()
    nonce = os.urandom(12)
    ct = AESGCM(key).encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.b64encode(nonce + ct).decode("ascii")


def decrypt_token(blob: str) -> str:
    """Decrypt a blob produced by encrypt_token back to the plaintext token."""
    key = _load_key()
    try:
        raw = base64.b64decode(blob)
    except Exception as exc:  # noqa: BLE001 - malformed input from caller
        raise ValueError("token blob is not valid base64") from exc
    if len(raw) < 12 + 16:
        raise ValueError("token blob too short to be AES-GCM output")
    nonce, ct = raw[:12], raw[12:]
    return AESGCM(key).decrypt(nonce, ct, None).decode("utf-8")
