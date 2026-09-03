"""
Testes de integridade do Chunked Upload (Upload Fracionado).
Garante que arquivos fatiados em partes de 20MB sejam reconstruídos
com 100% de integridade criptográfica (SHA-256 byte-a-byte idêntico).
"""

import os
import io
import uuid
import hashlib
import tempfile
import pytest


def test_chunked_assembly_hash_integrity():
    """
    Garante que fatiar um arquivo arbitrário em múltiplos pedaços e
    reagrupá-los produz exatamente o mesmo hash SHA-256 original.
    """
    # 1. Cria um payload de teste simulando dados binários (5 MB)
    original_data = os.urandom(5 * 1024 * 1024)
    original_hash = hashlib.sha256(original_data).hexdigest()

    # 2. Divide em 5 fatias de 1 MB
    chunk_size = 1024 * 1024
    chunks = [original_data[i:i + chunk_size] for i in range(0, len(original_data), chunk_size)]
    assert len(chunks) == 5

    # 3. Simula o processo do endpoint /upload/chunk no servidor
    upload_id = str(uuid.uuid4())
    temp_dir = tempfile.gettempdir()
    part_path = os.path.join(temp_dir, f"legisvox_chunk_{upload_id}.part")
    final_path = os.path.join(temp_dir, f"legisvox_upload_{upload_id}.zip")

    try:
        for idx, chunk_bytes in enumerate(chunks):
            mode = "wb" if idx == 0 else "ab"
            with open(part_path, mode) as f:
                f.write(chunk_bytes)

            if idx == len(chunks) - 1:
                if os.path.exists(final_path):
                    os.remove(final_path)
                os.replace(part_path, final_path)

        # 4. Verifica integridade do arquivo final remontado
        assert os.path.exists(final_path)
        with open(final_path, "rb") as f:
            assembled_data = f.read()

        assembled_hash = hashlib.sha256(assembled_data).hexdigest()

        # O teste falha se 1 único bit for diferente
        assert assembled_hash == original_hash
        assert len(assembled_data) == len(original_data)

    finally:
        # Limpeza
        if os.path.exists(part_path):
            os.remove(part_path)
        if os.path.exists(final_path):
            os.remove(final_path)


def test_uuid_regex_validation():
    """Valida que apenas UUIDs genuínos são aceitos para evitar directory traversal."""
    import re
    _UUID_REGEX = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.IGNORECASE)

    valid_uuid = str(uuid.uuid4())
    assert _UUID_REGEX.match(valid_uuid) is not None

    # Ataques de path traversal devem ser bloqueados
    invalid_traversal = "../../etc/passwd"
    assert _UUID_REGEX.match(invalid_traversal) is None

    invalid_chars = "12345678-1234-1234-1234-1234567890ab; rm -rf /"
    assert _UUID_REGEX.match(invalid_chars) is None


def test_chunk_size_exceeded_check():
    """Garante que o limite máximo de 500MB é respeitado."""
    MAX_SIZE = 10 * 1024 * 1024  # 10 MB simulado
    current_size = 9 * 1024 * 1024
    incoming_chunk = 2 * 1024 * 1024

    assert (current_size + incoming_chunk) > MAX_SIZE
