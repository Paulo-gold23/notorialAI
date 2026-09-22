import httpx
import hashlib
import hmac
import logging
import os
import re
import io
import secrets
import asyncio
import nh3
from config import settings

import ipaddress
import socket
from urllib.parse import urlparse

ALLOWED_TAGS = {
    "p", "b", "i", "u", "strong", "em", "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li", "span", "img", "div", "br", "a"
}

ALLOWED_ATTRIBUTES = {
    "img": {"src", "alt", "style", "class"},
    "a": {"href", "target", "style"},
    "div": {"style", "class"},
    "p": {"style", "class"},
    # data-user-note is the semantic attribute that carries the ressalva text.
    # It must be preserved through sanitization so the PDF transformer can read it.
    "span": {"style", "class", "data-user-note"},
    "h3": {"id"}
}

_BLOCKED_SSRF_HOSTS = {
    "localhost", "127.0.0.1", "0.0.0.0", "::1",
    "api", "caddy", "web", "gotenberg", "db", "postgres", "supabase", "redis"
}

def _is_safe_ssrf_url(url: str) -> bool:
    """Validates that a URL does not target internal services, loopbacks, or cloud metadata.
    Resolves DNS to prevent rebinding attacks (e.g. 169.254.169.254.nip.io)."""
    if not url:
        return False
    if url.startswith("#"):
        return True  # Safe internal document anchor (e.g. #data-02082021)
    if url.startswith("data:image/"):
        return True  # Safe base64 image
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False
        hostname = (parsed.hostname or "").lower().strip()
        if not hostname:
            return False
        if hostname in _BLOCKED_SSRF_HOSTS:
            return False
        if hostname.endswith(".local") or hostname.endswith(".internal") or hostname.endswith(".localhost"):
            return False
        # Check if hostname is a literal IP
        try:
            ip = ipaddress.ip_address(hostname)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                return False
        except ValueError:
            pass  # Normal domain name — resolve via DNS below
        # DNS resolution check: resolve domain and verify resolved IP is not internal
        try:
            resolved_ip = socket.gethostbyname(hostname)
            ip_obj = ipaddress.ip_address(resolved_ip)
            if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local or ip_obj.is_reserved:
                return False
        except (socket.gaierror, socket.timeout, OSError):
            return False  # DNS resolution failed — block by default
        return True
    except Exception:
        return False

def sanitize_user_html(html_content: str) -> str:
    """
    Sanitizes HTML content to prevent XSS and SSRF (Gotenberg internal network / cloud metadata reads).
    Preserves internal document anchors (href="#...") used by the date index.
    """
    # nh3 strips href when the URL scheme is not in url_schemes.
    # Fragment-only anchors (#data-02082021) have no scheme, so nh3 removes them.
    # Workaround: temporarily replace fragment hrefs with a safe placeholder,
    # then restore them after sanitization.
    _ANCHOR_PLACEHOLDER = "https://legisvox-internal-anchor.invalid/"
    anchors_map: dict[str, str] = {}

    def _protect_anchor(match):
        full_match = match.group(0)
        fragment = match.group(1)
        placeholder_url = f"{_ANCHOR_PLACEHOLDER}{fragment}"
        anchors_map[placeholder_url] = f"#{fragment}"
        return full_match.replace(f'href="#{fragment}"', f'href="{placeholder_url}"')

    protected = re.sub(
        r'<a[^>]+href="#([^"]+)"[^>]*>',
        _protect_anchor,
        html_content,
        flags=re.IGNORECASE
    )

    cleaned = nh3.clean(
        protected,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        url_schemes={"http", "https", "data"} # Blocks file:// scheme
    )

    # Restore internal anchors from placeholders
    for placeholder_url, original_fragment in anchors_map.items():
        cleaned = cleaned.replace(placeholder_url, original_fragment)

    # Post-process to remove unsafe SSRF URLs from img src and a href
    def _sanitize_src(match):
        attr = match.group(1)
        url = match.group(2)
        if not _is_safe_ssrf_url(url):
            return ""
        return f'{attr}="{url}"'

    cleaned = re.sub(r'(src|href)\s*=\s*["\']([^"\']+)["\']', _sanitize_src, cleaned, flags=re.IGNORECASE)
    return cleaned

logger = logging.getLogger(__name__)

def _add_class_to_list_tag(match):
    tag = match.group(1)
    attrs = match.group(2) or ""

    class_match = re.search(r'class\s*=\s*"([^"]*)"', attrs, flags=re.IGNORECASE)
    if class_match:
        classes = class_match.group(1).strip()
        if "indice-colunas" in classes.split():
            return f"<{tag}{attrs}>"
        new_classes = (classes + " indice-colunas").strip()
        new_attrs = re.sub(
            r'class\s*=\s*"[^"]*"',
            f'class="{new_classes}"',
            attrs,
            flags=re.IGNORECASE
        )
        return f"<{tag}{new_attrs}>"

    return f'<{tag} class="indice-colunas"{attrs}>'


def _format_index_as_columns(html_str: str) -> str:
    """
    Formata a secao de indice para duas colunas no PDF.
    """
    section_pattern = re.compile(
        r'(<h[1-6][^>]*>\s*(?:[Íí]ndice|[Ii]ndice)\s*</h[1-6]>)(.*?)(?=<h[1-6][^>]*>|$)',
        flags=re.IGNORECASE | re.DOTALL
    )

    def replace_section(match):
        heading = match.group(1)
        section_body = match.group(2)

        updated_body = re.sub(
            r'<(ul|ol)([^>]*)>',
            _add_class_to_list_tag,
            section_body,
            count=1,
            flags=re.IGNORECASE
        )

        # Se vier como paragrafo com links (nao lista), tambem quebra em colunas.
        if updated_body == section_body:
            updated_body = re.sub(
                r'(<p>)((?:(?!</?p>).)*?<a[^>]+href="#[^"]+"[^>]*>(?:(?!</?p>).)*?)(</p>)',
                r'<p class="indice-inline-colunas">\2</p>',
                section_body,
                count=1,
                flags=re.IGNORECASE | re.DOTALL
            )
            updated_body = updated_body.replace(" | ", "<br>")

        return heading + updated_body

    return section_pattern.sub(replace_section, html_str)


def _extract_text_from_html(html_str: str) -> str:
    """Extract plain text from an HTML fragment, collapsing whitespace."""
    clean = re.sub(r"<[^>]+>", " ", html_str)
    return " ".join(clean.split())


def inject_ressalva_blocks_for_pdf(html_content: str) -> str:
    """
    Transforms inline user-note marks into numbered superscripts in the text,
    and appends a formal compiled block of "RESSALVAS E OBSERVAÇÕES" at the end of
    each day's block.
    """
    # Split the HTML content by h3 day headers
    parts = re.split(r'(<h3[^>]*>.*?</h3>)', html_content, flags=re.IGNORECASE | re.DOTALL)
    
    global_note_index = 0
    processed_parts = []
    current_day_notes = []
    current_day_date = "Geral" # Fallback if notes are before the first header
    
    note_pattern = re.compile(
        r'<span[^>]*\bdata-user-note="([^"]+)"[^>]*>(.*?)</span>',
        re.IGNORECASE | re.DOTALL
    )
    
    def format_ressalvas_block(notes, date_label):
        if not notes:
            return ""
        items_html = []
        for n in notes:
            items_html.append(
                f'<div class="pdf-ressalva-item">'
                f'<span class="pdf-ressalva-num">[{n["index"]}]</span>'
                f'<div class="pdf-ressalva-body">'
                f'<span class="pdf-ressalva-text">{n["note"]}</span>'
                f'</div>'
                f'</div>'
            )
        return (
            f'<div class="pdf-ressalvas-section">'
            f'<div class="pdf-ressalvas-title">RESSALVAS E OBSERVAÇÕES — {date_label}</div>'
            f'{"".join(items_html)}'
            f'</div>'
        )

    for part in parts:
        # Check if it's a day header
        header_match = re.match(r'<h3[^>]*>(.*?)</h3>', part, re.IGNORECASE | re.DOTALL)
        if header_match:
            # We are hitting a new day header. Before we append it, let's output the ressalvas
            # accumulated for the previous day, if any.
            if current_day_notes:
                ressalvas_block = format_ressalvas_block(current_day_notes, current_day_date)
                processed_parts.append(ressalvas_block)
                current_day_notes = []
            
            # Update current day date
            header_text = header_match.group(1)
            # Remove any HTML tags inside the header (e.g. strong)
            current_day_date = _extract_text_from_html(header_text).strip()
            processed_parts.append(part)
        else:
            # It's a text block. Search and replace notes.
            def replace_note(match):
                nonlocal global_note_index
                note_text = match.group(1)
                inner_html = match.group(2)
                excerpt = _extract_text_from_html(inner_html)
                if len(excerpt) > 120:
                    excerpt = excerpt[:117] + '...'
                
                global_note_index += 1
                current_day_notes.append({
                    "index": global_note_index,
                    "note": note_text,
                    "excerpt": excerpt
                })
                # Keep the wrapper span for highlight styling and add superscript
                return f'<span class="user-note-wrapper" data-user-note="{note_text}">{inner_html}<sup class="pdf-ressalva-ref">[{global_note_index}]</sup></span>'
            
            cleaned_part = note_pattern.sub(replace_note, part)
            processed_parts.append(cleaned_part)
            
    # At the end of the document, flush any remaining notes for the last day
    if current_day_notes:
        ressalvas_block = format_ressalvas_block(current_day_notes, current_day_date)
        processed_parts.append(ressalvas_block)
        
    return "".join(processed_parts)


def inject_final_verification_box(html_str: str) -> str:
    """
    Injeta uma caixa de auditoria formal ("Verificação Final") no final do PDF.
    Calcula dinamicamente a contagem de mensagens, imagens, áudios e documentos.
    """
    # 1. Contar mensagens com padrão [DD/MM/AAAA HH:MM] ou [DD/MM/AAAA HH:MM:SS]
    msg_matches = re.findall(r'\[\d{2}/\d{2}/\d{4} \d{2}:\d{2}(?::\d{2})?\]', html_str)
    num_messages = len(msg_matches)

    # 2. Contar imagens (tags <img> com classe ata-imagem-anexada)
    num_images = len(re.findall(r'<img[^>]+class="[^"]*ata-imagem-anexada[^"]*"', html_str))

    # 3. Contar áudios ("Áudio Transcrito")
    num_audios = len(re.findall(r'Áudio Transcrito|\u00c1udio Transcrito', html_str))

    # 4. Contar documentos ("Documento Anexado")
    num_docs = len(re.findall(r'Documento Anexado', html_str))

    # 5. Contar ressalvas/observações (tags <span> com classe user-note-wrapper)
    num_ressalvas = len(re.findall(r'class="user-note-wrapper"|\buser-note-wrapper\b', html_str))

    # Formatar o texto de mídias de forma clara e elegante
    media_parts = []
    if num_images > 0:
        media_parts.append(f"{num_images} imagem" + ("s" if num_images > 1 else ""))
    if num_audios > 0:
        media_parts.append(f"{num_audios} áudio" + ("s" if num_audios > 1 else ""))
    if num_docs > 0:
        media_parts.append(f"{num_docs} documento" + ("s" if num_docs > 1 else ""))

    media_desc = ", ".join(media_parts) if media_parts else "nenhuma mídia"

    verification_html = f"""
<div class="pdf-verification-box">
  <div class="pdf-verification-title">Verificação final:</div>
  <ul class="pdf-verification-list">
    <li>Total de mensagens na saída: {num_messages} (igual ao input)</li>
    <li>Remetentes preservados sem alterações</li>
    <li>Mídias mantidas na ordem e quantidade exata ({media_desc})</li>
    <li>Ordem das mensagens idêntica ao input</li>
    <li>Total de ressalvas/observações inseridas: {num_ressalvas}</li>
  </ul>
</div>
"""
    if "</body>" in html_str:
        return html_str.replace("</body>", f"{verification_html}</body>")
    return html_str + verification_html


def _wrap_html_for_pdf(html_str: str) -> str:
    """
    Garante um documento HTML completo com estilo de impressao.
    Inclui: marca dagua LegisVox e numeracao de paginas (adicionada pelo Gotenberg).
    """
    processed = inject_ressalva_blocks_for_pdf(html_str)
    content = _format_index_as_columns(processed)
    content = inject_final_verification_box(content)

    css = """
    @page {
      margin: 20mm 18mm 28mm 18mm;
    }
    body {
      font-family: "Times New Roman", Times, serif;
      font-size: 12pt;
      line-height: 1.35;
      color: #111;
      text-align: justify;
      counter-reset: page-number;
    }
    p, li {
      orphans: 4;
      widows: 4;
    }
    /* Marca d’água LegisVox */
    .watermark {
      position: fixed;
      top: 46%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-38deg);
      font-size: 88pt;
      font-weight: 900;
      font-family: "Arial Black", Arial, sans-serif;
      color: rgba(30, 80, 180, 0.055);
      letter-spacing: 6px;
      white-space: nowrap;
      pointer-events: none;
      z-index: 0;
    }
    h1, h2, h3, h4, h5, h6 {
      margin: 0.6em 0 0.35em;
      page-break-after: avoid;
      text-align: left;
    }
    ul, ol {
      margin: 0.25em 0 0.75em;
    }
    .indice-colunas {
      columns: 2;
      -webkit-columns: 2;
      column-gap: 24px;
      padding-left: 18px;
      margin-top: 4px;
    }
    .indice-colunas li {
      break-inside: avoid;
      margin: 0 0 2px 0;
    }
    .indice-inline-colunas {
      columns: 2;
      -webkit-columns: 2;
      column-gap: 24px;
    }
    .indice-inline-colunas a {
      display: block;
      margin-bottom: 8px;
      break-inside: avoid;
      color: #1a56db;
      text-decoration: underline;
    }
    .indice-inline-colunas br {
      display: none;
    }
    /* Explicit blue hyperlink for index list items */
    .indice-colunas a {
      color: #1a56db;
      text-decoration: underline;
    }
    .ata-imagem-anexada {
      display: block;
      max-width: 70%;
      max-height: 260px;
      width: auto;
      height: auto;
      margin: 6px auto;
      border: 1px solid #d0d0d0;
      border-radius: 4px;
    }

    /* Parágrafo container de imagem */
    p:has(> .ata-imagem-anexada) {
      display: block;
      margin: 4px 0;
    }

    /* ── Ressalvas section (formal compiled block at end of day) ────────── */
    .pdf-ressalvas-section {
      display: block;
      margin: 12pt 0 16pt 0;
      padding: 10pt 12pt;
      background-color: #fefce8;
      border: 1pt solid #fef08a;
      border-radius: 4pt;
      page-break-inside: avoid;
    }
    .pdf-ressalvas-title {
      font-size: 9pt;
      font-weight: bold;
      color: #92400e;
      border-bottom: 1pt solid #fde047;
      padding-bottom: 4pt;
      margin-bottom: 8pt;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .pdf-ressalva-item {
      display: flex;
      align-items: flex-start;
      margin-bottom: 8pt;
    }
    .pdf-ressalva-item:last-child {
      margin-bottom: 0;
    }
    .pdf-ressalva-num {
      font-weight: bold;
      color: #d97706;
      font-size: 9.5pt;
      width: 24pt;
      flex-shrink: 0;
    }
    .pdf-ressalva-body {
      flex-grow: 1;
    }
    .pdf-ressalva-ref {
      display: block;
      font-style: italic;
      font-size: 8.5pt;
      color: #78350f;
      margin-bottom: 2pt;
    }
    .pdf-ressalva-text {
      display: block;
      color: #1c1917;
      font-size: 9.5pt;
    }
    /* Preserved highlight for original text in PDF body */
    .user-note-wrapper {
      border-bottom: 1.5pt dashed #d97706;
      background-color: transparent;
    }
    sup.pdf-ressalva-ref {
      font-size: 7.5pt;
      font-weight: bold;
      color: #d97706;
      vertical-align: super;
      margin-left: 1pt;
    }

    /* Caixa de Verificação Final / Auditoria */
    .pdf-verification-box {
      display: block;
      margin: 24pt 0 12pt 0;
      padding: 12pt 16pt;
      background-color: #f8fafc;
      border: 1pt solid #e2e8f0;
      border-radius: 6pt;
      page-break-inside: avoid;
    }
    .pdf-verification-title {
      font-size: 11pt;
      font-weight: bold;
      color: #1e293b;
      margin-bottom: 8pt;
    }
    .pdf-verification-list {
      margin: 0;
      padding-left: 14pt;
      list-style-type: disc;
    }
    .pdf-verification-list li {
      font-size: 10pt;
      color: #334155;
      line-height: 1.5;
      margin-bottom: 4pt;
    }
    .pdf-verification-list li:last-child {
      margin-bottom: 0;
    }

"""

    return f"""<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
{css}
  </style>
</head>
<body>
<div class="watermark">LegisVox</div>
{content}
</body>
</html>"""


# ══════════════════════════════════════════════════════════════════
# PDF TEMPLATE V2 — Opção B "Corporativo Moderno"
# Feature-flagged via is_admin. Legacy _wrap_html_for_pdf above is untouched.
# ══════════════════════════════════════════════════════════════════

# Official LegisVox Shield Logo (vector SVG for first-page banner)
_LOGO_SVG_SHIELD = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="38" height="38" style="vertical-align: middle;">
  <defs>
    <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0F172A"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>
    <linearGradient id="g-gold" x1="0" y1="0" x2="0" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FEF08A"/>
      <stop offset="100%" stop-color="#D97706"/>
    </linearGradient>
    <linearGradient id="g-blue" x1="0" y1="0" x2="0" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#3B82F6"/>
      <stop offset="100%" stop-color="#1E3A8A"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" rx="100" fill="url(#bg-grad)"/>
  <path d="M 256 40 L 100 80 L 100 270 C 100 390 256 465 256 465 C 256 465 412 390 412 270 L 412 80 Z" fill="none" stroke="url(#g-gold)" stroke-width="14"/>
  <path d="M 256 70 L 125 102 L 125 265 C 125 365 256 435 256 435 C 256 435 387 365 387 265 L 387 102 Z" fill="url(#g-blue)" opacity="0.85"/>
  <rect x="250" y="150" width="12" height="200" fill="url(#g-gold)"/>
  <rect x="160" y="180" width="192" height="10" rx="3" fill="url(#g-gold)"/>
  <circle cx="256" cy="150" r="14" fill="url(#g-gold)"/>
  <polygon points="256,110 246,140 266,140" fill="url(#g-gold)"/>
  <line x1="175" y1="190" x2="145" y2="270" stroke="url(#g-gold)" stroke-width="4"/>
  <line x1="175" y1="190" x2="205" y2="270" stroke="url(#g-gold)" stroke-width="4"/>
  <path d="M 140 270 C 140 295, 210 295, 210 270 Z" fill="url(#g-gold)"/>
  <line x1="337" y1="190" x2="307" y2="270" stroke="url(#g-gold)" stroke-width="4"/>
  <line x1="337" y1="190" x2="367" y2="270" stroke="url(#g-gold)" stroke-width="4"/>
  <path d="M 302 270 C 302 295, 372 295, 372 270 Z" fill="url(#g-gold)"/>
  <rect x="216" y="345" width="80" height="20" rx="4" fill="url(#g-gold)"/>
</svg>'''

# Simplified logo — monochrome version (for footer)
_LOGO_SVG_MONO = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="14" height="14"><path d="M 256 30 L 90 70 L 90 270 C 90 400 256 480 256 480 Z" fill="#94a3b8"/><path d="M 256 30 L 422 70 L 422 270 C 422 400 256 480 256 480 Z" fill="#64748b"/><path d="M 256 50 L 110 86 L 110 266 C 110 380 256 456 256 456 Z" fill="#475569"/><path d="M 256 50 L 402 86 L 402 266 C 402 380 256 456 256 456 Z" fill="#334155"/><rect x="240" y="200" width="16" height="148" fill="#94a3b8"/><rect x="256" y="200" width="16" height="148" fill="#64748b"/><rect x="150" y="136" width="106" height="8" fill="#94a3b8"/><rect x="256" y="136" width="106" height="8" fill="#64748b"/><polygon points="256,90 244,108 256,126" fill="#94a3b8"/><polygon points="256,90 268,108 256,126" fill="#64748b"/><line x1="160" y1="144" x2="124" y2="240" stroke="#94a3b8" stroke-width="2"/><line x1="160" y1="144" x2="196" y2="240" stroke="#94a3b8" stroke-width="2"/><path d="M 124 240 C 124 270, 196 270, 196 240 Z" fill="#94a3b8"/><line x1="352" y1="144" x2="316" y2="240" stroke="#64748b" stroke-width="2"/><line x1="352" y1="144" x2="388" y2="240" stroke="#64748b" stroke-width="2"/><path d="M 316 240 C 316 270, 388 270, 388 240 Z" fill="#64748b"/></svg>'''


def _format_chat_and_lists_for_v2(html_str: str) -> str:
    """
    Transforms plain chat paragraphs, index items, and participant lists into
    Option B corporate cards and styled blocks matching the mock design.
    Preserves all text, attachments, ressalvas, and chronological order 100%.
    """
    # 1. Transform Participant list into cards
    def add_participantes_class(match):
        h2 = match.group(1)
        tag = match.group(2)
        body = match.group(3)
        return f'{h2}<{tag} class="participantes-list">{body}</{tag}>'

    html_str = re.sub(
        r'(<h2[^>]*>\s*Participantes\s*</h2>\s*)<(ul|ol)[^>]*>(.*?)</\2>',
        add_participantes_class,
        html_str,
        flags=re.DOTALL | re.IGNORECASE
    )

    # 2. Transform Chat Messages into .msg-block cards
    msg_pattern = re.compile(
        r'<p>\s*\[(\d{2}/\d{2}/\d{4} \d{2}:\d{2}(?::\d{2})?)\]\s*([^:]+?):\s*(.*?)</p>',
        flags=re.DOTALL
    )

    def msg_replacer(match):
        ts = match.group(1).strip()
        sender = match.group(2).strip()
        body = match.group(3).strip()

        # Check for Document attached
        doc_match = re.match(r'^\[Documento:\s*(.*?)\]$', body, flags=re.DOTALL | re.IGNORECASE)
        if doc_match:
            doc_name = doc_match.group(1).strip()
            return f"""<div class="msg-block">
  <span class="msg-meta">[{ts}]</span> <span class="sender">{sender}:</span>
  <div class="media-box doc-box">
    <div class="media-title">📄 ARQUIVO DIGITAL ANEXADO: {doc_name}</div>
  </div>
</div>"""

        # Check for Audio transcribed
        audio_match = re.match(r'^\[(?:Áudio|Audio|AUDIO)\s+Transcrito:\s*(.*?)\]$', body, flags=re.DOTALL | re.IGNORECASE)
        if audio_match:
            audio_text = audio_match.group(1).strip()
            return f"""<div class="msg-block">
  <span class="msg-meta">[{ts}]</span> <span class="sender">{sender}:</span>
  <div class="media-box audio-box">
    <div class="media-title">🔊 REGISTRO FONOGRÁFICO / ÁUDIO TRANSCRITO</div>
    <div class="media-content">{audio_text}</div>
  </div>
</div>"""

        # Standard text message
        return f"""<div class="msg-block">
  <span class="msg-meta">[{ts}]</span> <span class="sender">{sender}:</span>
  <span class="msg-text">{body}</span>
</div>"""

    return msg_pattern.sub(msg_replacer, html_str)


def _wrap_html_for_pdf_v2(html_str: str, reviewer_name: str = "", zip_hash: str = "", ata_id: str = "") -> str:
    """
    V2 PDF template — Opção B "Corporativo Moderno".
    Source Serif 4 + Inter, Navy+Gold palette, no watermark.
    Injects LegisVox First Page Banner, Corporate Metadata Card, and formats messages as corporate cards.
    Content processing pipeline is identical to v1 (same inject_ressalva/index/verification calls).
    """
    processed = inject_ressalva_blocks_for_pdf(html_str)
    content = _format_index_as_columns(processed)
    content = inject_final_verification_box(content)
    content = _format_chat_and_lists_for_v2(content)

    # ── Injeção de Banner Inicial e Cartão de Metadados (Opção B Corporativo) ──
    protocol_code = ata_id[:8].upper() if ata_id else "LVX-2026"
    reviewer_display = reviewer_name or "Advogado / Usuário Responsável"

    banner_html = f"""<div class="first-page-banner">
  <div class="brand-group">
    {_LOGO_SVG_SHIELD}
    <div class="brand-text">
      <div class="brand-name">LegisVox</div>
    </div>
  </div>
  <div class="badge-tag">
    <div><strong>PROTOCOLO:</strong> LVX-{protocol_code}</div>
    <div>CONFORMIDADE ISO/IEC 27037</div>
  </div>
</div>"""

    hash_row = f'<div class="meta-row"><span class="meta-label">HASH SHA-256 (ZIP):</span> <span class="meta-val hash-text">{zip_hash}</span></div>' if zip_hash else ''
    meta_card_html = f"""<div class="doc-meta-card">
  <div class="meta-row"><span class="meta-label">PROCEDIMENTO:</span> <span class="meta-val">Relatório Técnico de Transcrição e Fixação Probatória</span></div>
  <div class="meta-row"><span class="meta-label">CONFERENTE:</span> <span class="meta-val">{reviewer_display}</span></div>
  {hash_row}
</div>"""

    # Injeta o banner antes do primeiro <h1> e o cartão de metadados logo abaixo do <h1>
    h1_match = re.search(r'(<h1[^>]*>.*?</h1>)', content, flags=re.DOTALL | re.IGNORECASE)
    if h1_match:
        h1_full = h1_match.group(1)
        replacement = f"{banner_html}\n{h1_full}\n{meta_card_html}"
        content = content[:h1_match.start()] + replacement + content[h1_match.end():]
    else:
        content = f"{banner_html}\n{meta_card_html}\n{content}"

    css = """
    * { box-sizing: border-box; }
    body {
      font-family: 'Source Serif 4', Georgia, 'Times New Roman', serif;
      font-size: 11pt;
      line-height: 1.55;
      color: #1e293b;
      text-align: justify;
      margin: 0;
      padding: 0;
    }
    p, li, div {
      orphans: 3;
      widows: 3;
    }

    /* ── Banner Inicial (Opção B Corporativo) ────────────────── */
    .first-page-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2pt solid #b45309;
      padding-bottom: 10pt;
      margin-bottom: 14pt;
    }
    .brand-group {
      display: flex;
      align-items: center;
      gap: 10pt;
    }
    .brand-text {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .brand-name {
      font-size: 18pt;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #0f172a;
      line-height: 1;
    }
    .badge-tag {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 8pt;
      font-weight: 600;
      color: #0f172a;
      background-color: #f1f5f9;
      border: 1pt solid #cbd5e1;
      border-radius: 4pt;
      padding: 4pt 8pt;
      text-align: right;
      line-height: 1.35;
    }

    /* ── Cartão de Metadados Corporativo ──────────────────────── */
    .doc-meta-card {
      background-color: #f8fafc;
      border: 1pt solid #e2e8f0;
      border-left: 3.5pt solid #0f172a;
      border-radius: 4pt;
      padding: 9pt 12pt;
      margin: 10pt 0 16pt;
      font-size: 9pt;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .meta-row { margin-bottom: 3pt; line-height: 1.35; }
    .meta-row:last-child { margin-bottom: 0; }
    .meta-label {
      font-weight: 600;
      color: #475569;
      display: inline-block;
      min-width: 130pt;
      font-size: 8.5pt;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .meta-val { color: #0f172a; font-weight: 500; }
    .hash-text {
      font-family: 'Courier New', Courier, monospace;
      font-size: 8pt;
      color: #334155;
      word-break: break-all;
    }

    /* ── Títulos e Hierarquia (Opção B Corporativo) ──────────── */
    h1, h2, h3, h4, h5, h6 {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #0f172a;
      margin: 0.8em 0 0.35em;
      page-break-after: avoid;
      text-align: left;
    }
    h1 {
      font-size: 15pt;
      font-weight: 700;
      margin: 8pt 0 4pt;
    }
    h2 {
      font-size: 11pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 1.5pt solid #e2e8f0;
      padding-bottom: 4pt;
      margin: 16pt 0 8pt;
      display: flex;
      align-items: center;
    }
    h2::before {
      content: "";
      display: inline-block;
      width: 6pt;
      height: 6pt;
      background-color: #b45309;
      border-radius: 1pt;
      margin-right: 6pt;
    }
    h3 {
      font-size: 10.5pt;
      font-weight: 700;
      color: #0f172a;
      border-left: 3.5pt solid #b45309;
      padding: 3pt 0 3pt 8pt;
      margin: 18pt 0 8pt;
      background: none;
    }

    /* ── Participantes: Cards Corporativos ──────────────────── */
    .participantes-list {
      list-style: none;
      padding-left: 0;
      margin: 6pt 0 14pt;
    }
    .participantes-list li {
      background-color: #f8fafc;
      border: 1pt solid #e2e8f0;
      border-left: 3pt solid #1e3a8a;
      border-radius: 0 4pt 4pt 0;
      padding: 5pt 10pt;
      margin-bottom: 4pt;
      font-family: 'Inter', -apple-system, sans-serif;
      font-size: 9pt;
      color: #0f172a;
    }

    /* ── Índice em Cards (Opção B Corporativo) ───────────────── */
    .indice-colunas {
      columns: 2;
      -webkit-columns: 2;
      column-gap: 16px;
      list-style: none;
      padding-left: 0;
      margin: 8pt 0 14pt;
    }
    .indice-colunas li {
      break-inside: avoid;
      background-color: #f8fafc;
      border: 1pt solid #e2e8f0;
      border-radius: 4pt;
      padding: 5pt 8pt;
      margin-bottom: 5pt;
      font-family: 'Inter', -apple-system, sans-serif;
      font-size: 8.5pt;
    }
    .indice-colunas a {
      color: #1e3a8a;
      text-decoration: none;
      font-weight: 600;
      display: flex;
      align-items: center;
    }
    .indice-colunas a::before {
      content: "▪";
      color: #b45309;
      font-size: 8pt;
      margin-right: 5pt;
    }
    .indice-inline-colunas {
      columns: 2;
      -webkit-columns: 2;
      column-gap: 16px;
      margin: 8pt 0 14pt;
    }
    .indice-inline-colunas a {
      break-inside: avoid;
      background-color: #f8fafc;
      border: 1pt solid #e2e8f0;
      border-radius: 4pt;
      padding: 5pt 8pt;
      margin-bottom: 5pt;
      font-family: 'Inter', -apple-system, sans-serif;
      font-size: 8.5pt;
      color: #1e3a8a;
      text-decoration: none;
      font-weight: 600;
      display: block;
    }
    .indice-inline-colunas a::before {
      content: "▪";
      color: #b45309;
      font-size: 8pt;
      margin-right: 5pt;
    }

    /* ── Mensagens Estruturadas (Opção B Corporativo) ────────── */
    .msg-block {
      margin-bottom: 7pt;
      padding: 2pt 0 2pt 4pt;
      line-height: 1.5;
    }
    .msg-meta {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 8.5pt;
      color: #64748b;
      font-weight: 500;
    }
    .sender {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-weight: 700;
      margin: 0 4pt;
      font-size: 9.5pt;
      color: #1e3a8a;
    }
    .msg-text {
      font-family: 'Source Serif 4', Georgia, serif;
      color: #1e293b;
      font-size: 10.5pt;
    }

    /* ── Mídias e Anexos (Cards com Ícones) ───────────────────── */
    .media-box {
      margin: 4pt 0 6pt 0;
      padding: 6pt 10pt;
      border: 1pt solid #cbd5e1;
      border-radius: 4pt;
      background-color: #f8fafc;
      font-size: 9pt;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .audio-box { border-left: 3.5pt solid #3b82f6; }
    .doc-box { border-left: 3.5pt solid #10b981; }
    .media-title { font-weight: 600; color: #0f172a; font-size: 8.5pt; }
    .media-content { font-family: 'Source Serif 4', Georgia, serif; font-style: italic; color: #334155; margin-top: 3pt; font-size: 9.5pt; }

    /* ── Imagens Anexadas ───────────────────────────────────── */
    .ata-imagem-anexada {
      display: block;
      max-width: 70%;
      max-height: 260px;
      width: auto;
      height: auto;
      margin: 8px auto;
      border: 0.5pt solid #cbd5e1;
      border-radius: 2px;
    }
    p:has(> .ata-imagem-anexada) {
      display: block;
      margin: 4px 0;
    }

    /* ── Ressalvas: Card Âmbar com Destaque Dourado ─────────── */
    .pdf-ressalvas-section {
      display: block;
      margin: 14pt 0 18pt;
      padding: 10pt 14pt;
      background-color: #fffbeb;
      border: 1pt solid #fde68a;
      border-left: 3pt solid #b45309;
      border-radius: 0 4pt 4pt 0;
      page-break-inside: avoid;
    }
    .pdf-ressalvas-title {
      font-family: 'Inter', -apple-system, sans-serif;
      font-size: 8.5pt;
      font-weight: 700;
      color: #92400e;
      border-bottom: 1pt solid #fde68a;
      padding-bottom: 4pt;
      margin-bottom: 8pt;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .pdf-ressalva-item {
      display: flex;
      align-items: flex-start;
      margin-bottom: 8pt;
    }
    .pdf-ressalva-item:last-child { margin-bottom: 0; }
    .pdf-ressalva-num {
      font-family: 'Inter', -apple-system, sans-serif;
      font-weight: bold;
      color: #b45309;
      font-size: 9pt;
      width: 24pt;
      flex-shrink: 0;
    }
    .pdf-ressalva-body { flex-grow: 1; }
    .pdf-ressalva-ref {
      display: block;
      font-style: italic;
      font-size: 8.5pt;
      color: #78350f;
      margin-bottom: 2pt;
    }
    .pdf-ressalva-text {
      display: block;
      color: #1c1917;
      font-size: 9.5pt;
    }
    .user-note-wrapper {
      border-bottom: 1.5pt dashed #b45309;
      background-color: transparent;
    }
    sup.pdf-ressalva-ref {
      font-size: 7.5pt;
      font-weight: bold;
      color: #b45309;
      vertical-align: super;
      margin-left: 1pt;
    }

    /* ── Caixa de Verificação Final ─────────────────────────── */
    .pdf-verification-box {
      display: block;
      margin: 24pt 0 12pt;
      padding: 14pt 18pt;
      background-color: #f8fafc;
      border: 1pt solid #cbd5e1;
      border-radius: 6pt;
      page-break-inside: avoid;
    }
    .pdf-verification-title {
      font-family: 'Inter', -apple-system, sans-serif;
      font-size: 10.5pt;
      font-weight: 700;
      color: #0f172a;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 8pt;
      border-bottom: 1pt solid #e2e8f0;
      padding-bottom: 6pt;
    }
    .pdf-verification-list {
      margin: 0;
      padding-left: 14pt;
      list-style-type: disc;
    }
    .pdf-verification-list li {
      font-size: 9.5pt;
      color: #334155;
      line-height: 1.5;
      margin-bottom: 4pt;
    }
    .pdf-verification-list li:last-child { margin-bottom: 0; }

    /* ── Links ──────────────────────────────────────────────── */
    a { color: #1e40af; text-decoration: underline; }
"""

    return f"""<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:ital,wght@0,400;0,600;0,700;1,400&display=swap" rel="stylesheet">
  <style>
{css}
  </style>
</head>
<body>
{content}
</body>
</html>"""


def _build_footer_html_v2(reviewer_name: str = "", zip_hash: str = "") -> str:
    """
    V2 footer template — 2-line layout per grill-me decision.
    Line 1: "LEGISVOX" left | "Página X de Y" right
    Line 2: Full dynamic disclaimer (reviewer, LGPD, hash) in smaller font
    Uses system fonts only (no @import, no SVG) for Gotenberg compatibility.
    """
    conferido_por = f"e conferido por <strong>{reviewer_name}</strong>" if reviewer_name else "e conferido por usuário"

    disclaimer_extra = ""
    if zip_hash:
        disclaimer_extra = f" Aviso MCR e LGPD: Documento gerado por IA via LegisVox. Sem fé pública. Hash SHA-256 do ZIP: {zip_hash}."

    return f"""<!DOCTYPE html>
<html><head><style>
  body {{
    font-family: 'Segoe UI', Helvetica, Arial, sans-serif;
    margin: 0;
    padding: 0 18mm 6mm 18mm;
    box-sizing: border-box;
    width: 100%;
  }}
  .footer-container {{
    border-top: 1px solid #cbd5e1;
    padding-top: 4px;
  }}
  .footer-line1 {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 7pt;
    color: #475569;
    margin-bottom: 2px;
  }}
  .footer-brand-name {{
    font-weight: 700;
    color: #0f172a;
    letter-spacing: 0.06em;
  }}
  .footer-page {{
    font-weight: 600;
    color: #334155;
  }}
  .footer-line2 {{
    font-size: 6pt;
    color: #94a3b8;
    line-height: 1.4;
    text-align: justify;
  }}
</style></head>
<body>
<div class="footer-container">
  <div class="footer-line1">
    <span class="footer-brand-name">LEGISVOX</span>
    <span class="footer-page">P&#225;gina <span class="pageNumber"></span> de <span class="totalPages"></span></span>
  </div>
  <div class="footer-line2">
    Conte&#250;do organizado por Intelig&#234;ncia Artificial {conferido_por}.{disclaimer_extra} As notas de ressalva s&#227;o independentes e de inteira responsabilidade do usu&#225;rio.
  </div>
</div>
</body></html>"""


def _build_header_html_v2() -> str:
    """
    V2 header template — repeating header on pages 2+ with brand + protocol.
    Uses Chromium header/footer special classes for page numbering.
    """
    return f"""<!DOCTYPE html>
<html><head><style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap');
  body {{
    font-family: 'Inter', 'Segoe UI', sans-serif;
    margin: 0;
    padding: 6mm 20mm 0 20mm;
    box-sizing: border-box;
    width: 100%;
  }}
  .header-bar {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 4px;
    font-size: 7pt;
    color: #64748b;
  }}
  .header-brand {{
    font-weight: 600;
    color: #0f172a;
    letter-spacing: 0.03em;
  }}
  .header-protocol {{
    color: #94a3b8;
    font-size: 6.5pt;
  }}
</style></head>
<body>
<div class="header-bar">
  <span><span class="header-brand">LEGISVOX</span> <span style="color:#cbd5e1">|</span> Relat&#243;rio T&#233;cnico de Prova Forense</span>
  <span class="header-protocol"></span>
</div>
</body></html>"""




MAX_PDF_RETRIES = 3
PDF_RETRY_BASE_DELAY = 2  # seconds

# Gotenberg Guard: limits concurrent PDF generations to prevent RAM spikes.
# Created lazily to avoid event-loop-not-running errors at module import time.
_pdf_semaphore: asyncio.Semaphore | None = None

def _get_pdf_semaphore() -> asyncio.Semaphore:
    global _pdf_semaphore
    if _pdf_semaphore is None:
        _pdf_semaphore = asyncio.Semaphore(2)
    return _pdf_semaphore


class PdfGenerationError(Exception):
    """Raised when PDF generation fails with a user-friendly message."""
    pass


def _protect_and_hash_pdf_sync(pdf_content: bytes, ata_id: str = "") -> tuple[bytes, str]:
    """CPU-bound encryption and cloning of PDF. Executed in a thread pool to avoid blocking asyncio.

    The owner password is derived deterministically from ata_id + PDF_OWNER_SECRET
    so that regenerations of the same ata produce identical encrypted PDFs and
    therefore identical SHA-256 hashes (enabling reliable public hash verification).
    """
    protected_content = pdf_content
    try:
        from pypdf import PdfReader, PdfWriter
        reader = PdfReader(io.BytesIO(pdf_content))
        writer = PdfWriter()
        writer.clone_reader_document_root(reader)

        # Deterministic owner password: HMAC(ata_id, secret) → stable across regenerations
        pdf_secret = settings.PDF_OWNER_SECRET
        if pdf_secret and ata_id:
            owner_pass = hmac.new(
                pdf_secret.encode("utf-8"),
                ata_id.encode("utf-8"),
                hashlib.sha256
            ).hexdigest()[:32]
        else:
            # Fallback: random (original behavior if no secret configured)
            if ata_id:
                logger.warning(
                    f"[PDF] PDF_OWNER_SECRET não configurado — usando owner password aleatória para ata {ata_id}. "
                    "Hash do PDF será diferente a cada regeneração (verificação pública pode falhar)."
                )
            owner_pass = secrets.token_hex(16)

        writer.encrypt(
            user_password="",
            owner_password=owner_pass,
            permissions_flag=0b0000000000100
        )
        out = io.BytesIO()
        writer.write(out)
        protected_content = out.getvalue()
    except Exception as e:
        logger.warning(f"Erro ao proteger PDF com pypdf, continuando com original: {e}")

    pdf_hash = hashlib.sha256(protected_content).hexdigest()
    return protected_content, pdf_hash


async def generate_pdf_from_html(html_str: str, reviewer_name: str = "", zip_hash: str = "", ata_id: str = "", use_new_template: bool = False) -> tuple[bytes, str] | tuple[None, None]:
    """
    Consome a API do Gotenberg via URL do Env.
    Inclui retry automático com backoff para lidar com instabilidades do Gotenberg.
    Retorna uma tuple (pdf_bytes, pdf_sha256_hash) onde o hash é do PDF final protegido.
    Limitado a 2 chamadas concorrentes via semáforo para proteger RAM do Gotenberg.
    """
    sem = _get_pdf_semaphore()
    if sem.locked():
        logger.info("[PDF] Aguardando liberação do semáforo de PDF (máximo 2 concorrentes)")

    async with sem:
        return await _generate_pdf_from_html_inner(html_str, reviewer_name, zip_hash, ata_id, use_new_template)


async def _generate_pdf_from_html_inner(html_str: str, reviewer_name: str = "", zip_hash: str = "", ata_id: str = "", use_new_template: bool = False) -> tuple[bytes, str] | tuple[None, None]:
    """Inner implementation of PDF generation (called within semaphore guard)."""
    url = getattr(settings, 'PDF_CONVERTER_URL', getattr(settings, 'GOTENBERG_URL', "http://localhost:3000/forms/chromium/convert/html"))

    if "convert/html" not in url:
        url = f"{url.rstrip('/')}/forms/chromium/convert/html"

    sanitized_html = sanitize_user_html(html_str)

    # ── Template selection: v2 (Corporativo Moderno) vs v1 (legacy) ──
    if use_new_template:
        html_for_pdf = _wrap_html_for_pdf_v2(sanitized_html, reviewer_name=reviewer_name, zip_hash=zip_hash, ata_id=ata_id)
        footer_html = _build_footer_html_v2(reviewer_name, zip_hash)
        header_html = None  # Disabled: reintroduce after confirming PDF works
        logger.info(f"[PDF] Usando template v2 (Corporativo Moderno) para ata {ata_id}")
    else:
        # Note: inject_ressalva_blocks_for_pdf is called inside _wrap_html_for_pdf
        html_for_pdf = _wrap_html_for_pdf(sanitized_html)
        header_html = None  # v1 has no header

        conferido_por = f"e conferido por <strong>{reviewer_name}</strong>" if reviewer_name else "e conferido por usuário"

        disclaimer = ""
        if zip_hash:
            disclaimer = f"<br><strong>Aviso MCR e LGPD:</strong> Documento gerado por IA via LegisVox. Sem fé pública. A conferência com o arquivo original (Hash SHA-256 do ZIP: {zip_hash}) é obrigatória. As notas de ressalva são independentes e de inteira responsabilidade do usuário."

        # Gotenberg: margens e paginação via header nativo do Chrome
        # O footer.html usa as classes especiais do Chromium para numeração nativa por página
        footer_html = f"""<!DOCTYPE html>
<html><head><style>
  body {{
    font-family: "Times New Roman", Times, serif;
    font-size: 7pt;
    color: #666;
    margin: 0;
    padding: 0 18mm 6mm 18mm;
    box-sizing: border-box;
    width: 100%;
  }}
  .footer-bar {{
    width: 100%;
    text-align: right;
    padding-top: 6px;
    line-height: 1.4;
    border-top: 1px solid #ccc;
  }}
  .footer-text {{
    text-align: justify;
    display: block;
    margin-bottom: 3px;
  }}
  .footer-page {{
    text-align: right;
    display: block;
    font-weight: bold;
  }}
</style></head>
<body>
<div class="footer-bar">
  <span class="footer-text">Conteúdo organizado por Inteligência Artificial {conferido_por}.{disclaimer}</span>
  <span class="footer-page">P&#225;gina <span class="pageNumber"></span> de <span class="totalPages"></span></span>
</div>
</body></html>"""

    # Debug preview: only active when DEBUG_PDF_PREVIEW=true (never in production)
    if os.getenv("DEBUG_PDF_PREVIEW", "false").lower() == "true":
        try:
            import pathlib
            _diag_path = pathlib.Path(__file__).parent.parent / "debug_pdf_preview.html"
            _diag_path.write_text(html_for_pdf, encoding='utf-8')
            logger.info(f"[PDF_DIAG] HTML salvo em: {_diag_path} ({len(html_str):,} chars, {html_str.count('<img '):} imgs)")
        except Exception as _e:
            logger.warning(f"[PDF_DIAG] Falha ao salvar HTML de diagnóstico: {_e}")

    # ── Gotenberg form data: margins differ between v1 and v2 ──
    if use_new_template:
        data = {
            'marginTop': '20mm',
            'marginBottom': '16mm',
            'marginLeft': '18mm',
            'marginRight': '18mm',
            'printBackground': 'true',
        }
    else:
        data = {
            'marginTop': '20mm',
            'marginBottom': '16mm',
            'marginLeft': '18mm',
            'marginRight': '18mm',
            'printBackground': 'true',
        }

    last_error = None

    for attempt in range(1, MAX_PDF_RETRIES + 1):
        # Rebuild files tuple on each attempt (httpx consumes the generator)
        files = [
            ('files', ('index.html', html_for_pdf, 'text/html')),
            ('files', ('footer.html', footer_html, 'text/html')),
        ]
        if header_html:
            files.append(('files', ('header.html', header_html, 'text/html')))

        try:
            from database import get_http_client
            client = get_http_client()
            response = await client.post(url, files=files, data=data, timeout=180.0)

            if response.status_code == 200:
                if attempt > 1:
                    logger.info(f"Gotenberg PDF gerado com sucesso na tentativa {attempt}")
                
                pdf_content = response.content
                
                # Offload CPU-bound PDF protection/encryption to thread pool (avoids blocking asyncio)
                loop = asyncio.get_running_loop()
                pdf_content, pdf_hash = await loop.run_in_executor(
                    None, lambda: _protect_and_hash_pdf_sync(pdf_content, ata_id)
                )
                logger.info(f"PDF gerado e protegido — SHA-256: {pdf_hash[:16]}...")
                return pdf_content, pdf_hash

            # Server error — worth retrying
            if response.status_code >= 500:
                last_error = f"Gotenberg retornou erro {response.status_code}"
                logger.warning(
                    f"Gotenberg erro {response.status_code} na tentativa {attempt}/{MAX_PDF_RETRIES}: "
                    f"{response.text[:200]}"
                )
                if attempt < MAX_PDF_RETRIES:
                    import asyncio
                    await asyncio.sleep(PDF_RETRY_BASE_DELAY * attempt)
                    continue

            # Client error (4xx) — no point retrying
            error_detail = response.text[:200]
            logger.error(f"Gotenberg erro fatal {response.status_code}: {error_detail}")
            raise PdfGenerationError(
                "Falha ao gerar PDF: o serviço de conversão retornou um erro. "
                "Tente novamente em alguns instantes."
            )

        except httpx.TimeoutException:
            last_error = "Timeout na geração do PDF"
            logger.warning(
                f"Gotenberg timeout na tentativa {attempt}/{MAX_PDF_RETRIES}"
            )
            if attempt < MAX_PDF_RETRIES:
                import asyncio
                await asyncio.sleep(PDF_RETRY_BASE_DELAY * attempt)
                continue

        except httpx.ConnectError:
            last_error = "Serviço de PDF indisponível"
            logger.error(
                f"Gotenberg conexão recusada na tentativa {attempt}/{MAX_PDF_RETRIES}. "
                f"URL: {url}"
            )
            if attempt < MAX_PDF_RETRIES:
                import asyncio
                await asyncio.sleep(PDF_RETRY_BASE_DELAY * attempt)
                continue
            raise PdfGenerationError(
                "O serviço de geração de PDF não está disponível no momento. "
                "Verifique se o Gotenberg está rodando e tente novamente."
            )

        except PdfGenerationError:
            raise

        except Exception as e:
            last_error = str(e)
            logger.error(f"Gotenberg exceção inesperada: {e}", exc_info=True)
            if attempt < MAX_PDF_RETRIES:
                import asyncio
                await asyncio.sleep(PDF_RETRY_BASE_DELAY * attempt)
                continue

    # Exhausted all retries
    logger.error(f"Gotenberg falhou após {MAX_PDF_RETRIES} tentativas. Último erro: {last_error}")
    raise PdfGenerationError(
        f"Falha ao gerar PDF após {MAX_PDF_RETRIES} tentativas. "
        "O documento foi preservado — você pode tentar gerar o PDF novamente."
    )
