"""Chunked upload assembly.

Production incident (09/10/2026): a 755 MB ZIP hit the 500 MB limit at chunk 100; the server
deleted the partial file, the browser retried the same chunk, and the old append-only logic
started a *new* file from chunk 100. The "assembled" ZIP lacked its first 500 MB and failed
later with an opaque error. Rules enforced here:

- Chunks are written at their absolute offset (index * chunk_size): re-sending a chunk is
  idempotent and can never shift data.
- A chunk with index > 0 whose partial file is missing is rejected (409), never re-started.
- The declared total size is checked against the limit on the first chunk, and against the
  real size when assembling; the result must start with a ZIP signature.
"""
import os

ZIP_SIGNATURES = (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")


class ChunkUploadError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _limit_message(max_size: int) -> str:
    return (f"Arquivo excede o limite máximo permitido de {max_size // (1024 * 1024)} MB. "
            f"Selecione um período menor para reduzir o tamanho do envio.")


def write_chunk(part_path: str, chunk_index: int, total_chunks: int, data: bytes,
                max_size: int, chunk_size: int | None = None, total_size: int | None = None) -> None:
    if not data:
        raise ChunkUploadError(400, "Fatia do arquivo vazia")
    if chunk_index < 0 or chunk_index >= total_chunks:
        raise ChunkUploadError(400, "chunk_index fora dos limites")
    if chunk_size is not None and (chunk_size <= 0 or len(data) > chunk_size):
        raise ChunkUploadError(400, "Tamanho de fatia inválido")
    if total_size is not None and total_size > max_size:
        _remove(part_path)
        raise ChunkUploadError(413, _limit_message(max_size))

    if chunk_index == 0:
        mode = "wb"
    elif not os.path.exists(part_path):
        raise ChunkUploadError(
            409, "O envio foi interrompido e as partes anteriores não estão mais no servidor. "
                 "Envie o arquivo novamente desde o início."
        )
    else:
        mode = "r+b"

    if chunk_size:
        offset = chunk_index * chunk_size
    else:
        # Legacy client without chunk_size: append (still protected by the 409 rule above).
        offset = os.path.getsize(part_path) if chunk_index > 0 else 0

    if offset + len(data) > max_size:
        _remove(part_path)
        raise ChunkUploadError(413, _limit_message(max_size))

    with open(part_path, mode) as f:
        f.seek(offset)
        f.write(data)


def finalize(part_path: str, final_path: str, total_size: int | None = None) -> int:
    """Validate the assembled file and move it into place. Returns its size."""
    if not os.path.exists(part_path):
        raise ChunkUploadError(409, "Partes do arquivo não encontradas no servidor. Envie novamente.")
    size = os.path.getsize(part_path)
    if total_size is not None and size != total_size:
        _remove(part_path)
        raise ChunkUploadError(
            400, f"Arquivo montado incompleto ({size} de {total_size} bytes). Envie novamente."
        )
    with open(part_path, "rb") as f:
        head = f.read(4)
    if head not in ZIP_SIGNATURES:
        _remove(part_path)
        raise ChunkUploadError(400, "O arquivo recebido não é um ZIP válido ou chegou corrompido. Envie novamente.")
    os.replace(part_path, final_path)
    return size


def _remove(path: str) -> None:
    try:
        os.remove(path)
    except FileNotFoundError:
        pass
