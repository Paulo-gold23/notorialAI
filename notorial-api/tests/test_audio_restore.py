import re

_AUDIO_MARKER_RE = re.compile(r'%%AUDIO_(\d+)%%')

def _restore_audio_markers(html_text: str, audio_schedule: list[dict]) -> str:
    if not audio_schedule:
        return html_text

    pos_lookup = {entry["pos"]: entry for entry in audio_schedule}
    frag_lookup = []
    
    for entry in audio_schedule:
        if entry.get("transcricao"):
            frag = entry["transcricao"].strip()[:60].lower()
            frag_lookup.append((frag, entry))

    queue = list(audio_schedule)
    consumed_ids = set()
    lines = html_text.split("\n")
    out_lines = []

    for line in lines:
        marker_match = _AUDIO_MARKER_RE.search(line)
        is_audio_line = bool(marker_match) or ("<p>" in line and "\U0001f399" in line)

        if not is_audio_line:
            out_lines.append(line)
            continue

        matched_entry = None

        # Try to find the best match
        
        # 1. Fragment Match (most reliable if transcription exists)
        line_lower = line.lower()
        for frag, entry in frag_lookup:
            eid = id(entry)
            if eid not in consumed_ids and frag and frag in line_lower:
                matched_entry = entry
                consumed_ids.add(eid)
                break
                
        # 2. Marker Match with Remetente Validation
        if not matched_entry and marker_match:
            try:
                pos = int(marker_match.group(1))
                if pos in pos_lookup and id(pos_lookup[pos]) not in consumed_ids:
                    entry = pos_lookup[pos]
                    # Validate that the line actually belongs to the sender!
                    # Or if it's the only audio left, we might trust it.
                    # A good heuristic: Does the line contain the sender's name?
                    rem_lower = entry["remetente"].lower()
                    if rem_lower in line_lower:
                        matched_entry = entry
                        consumed_ids.add(id(matched_entry))
            except ValueError:
                pass
                
        # 3. Just Marker Match (trusting the AI)
        if not matched_entry and marker_match:
            try:
                pos = int(marker_match.group(1))
                if pos in pos_lookup and id(pos_lookup[pos]) not in consumed_ids:
                    matched_entry = pos_lookup[pos]
                    consumed_ids.add(id(matched_entry))
            except ValueError:
                pass

        # 4. FIFO fallback
        if not matched_entry and is_audio_line:
            for entry in queue:
                if id(entry) not in consumed_ids:
                    matched_entry = entry
                    consumed_ids.add(id(entry))
                    break

        if not matched_entry:
            out_lines.append(line)
            continue

        remetente = matched_entry["remetente"]
        transcricao = matched_entry.get("transcricao") or ""

        out_lines.append(f"INJECTED: {remetente} - {transcricao[:20]}")

    return "\n".join(out_lines)

html = """<p>[24/04/2026 17:33] Cristiane Cicatrize: %%AUDIO_1%% "Oi, Paulo, tudo jóia..."</p>"""
sched = [
    {"pos": 1, "ts": "24/04/2026 17:30", "remetente": "paulo goldner", "transcricao": "Ok, aguardo."},
    {"pos": 2, "ts": "24/04/2026 17:33", "remetente": "Cristiane Cicatrize", "transcricao": "Oi, Paulo, tudo jóia..."}
]

print(_restore_audio_markers(html, sched))
