-- Migration: Phase 3c - Chunk Zip Hash Global Cache
-- Permite reaproveitamento instantâneo de chunks entre re-uploads do mesmo arquivo

CREATE OR REPLACE FUNCTION public.get_cached_chunk_by_zip_hash(
  p_zip_hash text,
  p_chunk_index int,
  p_total_chunks int
)
RETURNS TABLE(content text)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT c.content
  FROM public.ata_chunks_cache c
  JOIN public.atas a ON c.ata_id = a.id
  WHERE a.zip_hash = p_zip_hash
    AND c.chunk_index = p_chunk_index
    AND c.total_chunks = p_total_chunks
  LIMIT 1;
$$;
