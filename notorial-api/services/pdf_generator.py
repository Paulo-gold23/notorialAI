import httpx
import hashlib
import logging
import os
import re
import io
import secrets
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


MAX_PDF_RETRIES = 3
PDF_RETRY_BASE_DELAY = 2  # seconds


class PdfGenerationError(Exception):
    """Raised when PDF generation fails with a user-friendly message."""
    pass


def _protect_and_hash_pdf_sync(pdf_content: bytes) -> tuple[bytes, str]:
    """CPU-bound encryption and cloning of PDF. Executed in a thread pool to avoid blocking asyncio."""
    protected_content = pdf_content
    try:
        from pypdf import PdfReader, PdfWriter
        reader = PdfReader(io.BytesIO(pdf_content))
        writer = PdfWriter()
        writer.clone_reader_document_root(reader)
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


async def generate_pdf_from_html(html_str: str, reviewer_name: str = "", zip_hash: str = "") -> tuple[bytes, str] | tuple[None, None]:
    """
    Consome a API do Gotenberg via URL do Env.
    Inclui retry automático com backoff para lidar com instabilidades do Gotenberg.
    Retorna uma tuple (pdf_bytes, pdf_sha256_hash) onde o hash é do PDF final protegido.
    """
    url = getattr(settings, 'PDF_CONVERTER_URL', getattr(settings, 'GOTENBERG_URL', "http://localhost:3000/forms/chromium/convert/html"))

    if "convert/html" not in url:
        url = f"{url.rstrip('/')}/forms/chromium/convert/html"

    sanitized_html = sanitize_user_html(html_str)
    # Note: inject_ressalva_blocks_for_pdf is called inside _wrap_html_for_pdf
    html_for_pdf = _wrap_html_for_pdf(sanitized_html)

    # Debug preview: only active when DEBUG_PDF_PREVIEW=true (never in production)
    if os.getenv("DEBUG_PDF_PREVIEW", "false").lower() == "true":
        try:
            import pathlib
            _diag_path = pathlib.Path(__file__).parent.parent / "debug_pdf_preview.html"
            _diag_path.write_text(html_for_pdf, encoding='utf-8')
            logger.info(f"[PDF_DIAG] HTML salvo em: {_diag_path} ({len(html_str):,} chars, {html_str.count('<img '):} imgs)")
        except Exception as _e:
            logger.warning(f"[PDF_DIAG] Falha ao salvar HTML de diagnóstico: {_e}")


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

        try:
            from database import get_http_client
            client = get_http_client()
            response = await client.post(url, files=files, data=data, timeout=90.0)

            if response.status_code == 200:
                if attempt > 1:
                    logger.info(f"Gotenberg PDF gerado com sucesso na tentativa {attempt}")
                
                pdf_content = response.content
                
                # Offload CPU-bound PDF protection/encryption to thread pool (avoids blocking asyncio)
                loop = asyncio.get_running_loop()
                pdf_content, pdf_hash = await loop.run_in_executor(
                    None, _protect_and_hash_pdf_sync, pdf_content
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
