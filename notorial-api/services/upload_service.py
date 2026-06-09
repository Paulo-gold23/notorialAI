import hashlib

def save_upload_file_with_limit_and_hash(upload_file, destination_path: str, max_size: int):
    """Save upload file to disk chunk by chunk, returning size and hash."""
    size = 0
    sha256_hash = hashlib.sha256()
    with open(destination_path, "wb") as buffer:
        while chunk := upload_file.file.read(1024 * 1024):
            size += len(chunk)
            if size > max_size:
                raise ValueError(f"Arquivo muito grande ({size / (1024 * 1024):.0f}MB). Limite máximo: {max_size // (1024*1024)}MB")
            sha256_hash.update(chunk)
            buffer.write(chunk)
    return size, sha256_hash.hexdigest()
