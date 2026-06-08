import httpx
import hashlib
import logging
import re
import io
import secrets
import nh3
from config import settings

ALLOWED_TAGS = {
    "p", "b", "i", "u", "strong", "em", "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li", "span", "img", "div", "br", "a"
}

ALLOWED_ATTRIBUTES = {
    "img": {"src", "alt", "style", "class"},
    "a": {"href", "target", "style"},
    "div": {"style", "class"},
    "p": {"style", "class"},
    "span": {"style", "class"},
    "h3": {"id"}
}

def sanitize_user_html(html_content: str) -> str:
    """
    Sanitizes HTML content to prevent XSS and SSRF (Gotenberg local file reads).
    """
    return nh3.clean(
        html_content,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        url_schemes={"http", "https", "data"} # Blocks file:// scheme
    )

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


def _wrap_html_for_pdf(html_str: str) -> str:
    """
    Garante um documento HTML completo com estilo de impressao.
    Inclui: marca dagua LegisVox e numeracao de paginas (adicionada pelo Gotenberg).
    """
    content = _format_index_as_columns(html_str)


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
    }
    .indice-inline-colunas br {
      display: none;
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
                # Protect PDF (Immutable restrictions)
                # NOTE: pypdf writer.add_page() does NOT copy /Annots (link annotations).
                # We must clone the document to preserve internal hyperlinks from the index.
                try:
                    from pypdf import PdfReader, PdfWriter
                    reader = PdfReader(io.BytesIO(pdf_content))
                    writer = PdfWriter()
                    # clone_reader_document_root preserves all annotations including
                    # internal anchor links (Link annotations used by the index)
                    writer.clone_reader_document_root(reader)
                    owner_pass = secrets.token_hex(16)
                    writer.encrypt(
                        user_password="",
                        owner_password=owner_pass,
                        permissions_flag=0b0000000000100
                    )
                    out = io.BytesIO()
                    writer.write(out)
                    pdf_content = out.getvalue()
                except Exception as e:
                    logger.warning(f"Erro ao proteger PDF com pypdf, continuando: {e}")

                # Compute SHA-256 of the final protected PDF
                pdf_hash = hashlib.sha256(pdf_content).hexdigest()
                logger.info(f"PDF gerado — SHA-256: {pdf_hash[:16]}...")
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
