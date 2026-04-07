import httpx
import logging
import re
from config import settings

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
      counter-reset: page-number;
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
      max-width: 60%;
      max-height: 400px;
      width: auto;
      height: auto;
      display: block;
      margin: 20px auto;
      border: 1px solid #eaeaea;
      border-radius: 6px;
      page-break-inside: avoid;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
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


async def generate_pdf_from_html(html_str: str, reviewer_name: str = "") -> bytes | None:
    """Consome a API do Gotenberg via URL do Env"""
    url = getattr(settings, 'PDF_CONVERTER_URL', getattr(settings, 'GOTENBERG_URL', "http://localhost:3000/forms/chromium/convert/html"))

    if "convert/html" not in url:
        url = f"{url.rstrip('/')}/forms/chromium/convert/html"

    html_for_pdf = _wrap_html_for_pdf(html_str)
    
    conferido_por = f"e conferido por <strong>{reviewer_name}</strong>" if reviewer_name else "e conferido por usuário"
    
    # Gotenberg: margens e paginação via header nativo do Chrome
    # O footer.html usa as classes especiais do Chromium para numeração nativa por página
    footer_html = f"""<!DOCTYPE html>
<html><head><style>
  body {{
    font-family: "Times New Roman", Times, serif;
    font-size: 8.5pt;
    color: #888;
    margin: 0;
    padding: 0;
  }}
  .footer-bar {{
    width: 100%;
    text-align: center;
    padding-top: 4px;
    line-height: 1.5;
  }}
</style></head>
<body>
<div class="footer-bar">
  Conteúdo organizado por Inteligência Artificial {conferido_por}.<br>
  P&#225;gina <span class="pageNumber"></span> de <span class="totalPages"></span>
</div>
</body></html>"""

    # Multipart como lista para suportar múltiplos arquivos com a mesma chave 'files'
    files = [
        ('files', ('index.html', html_for_pdf, 'text/html')),
        ('files', ('footer.html', footer_html, 'text/html')),
    ]
    data = {
        'marginTop': '20mm',
        'marginBottom': '16mm',
        'marginLeft': '18mm',
        'marginRight': '18mm',
        'printBackground': 'true',
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, files=files, data=data, timeout=60.0)

        if response.status_code == 200:
            return response.content
        else:
            logger.error(f"Erro no Gotenberg {response.status_code}: {response.text}")
            return None

    except Exception as e:
        logger.error(f"Gotenberg exception: {e}")
        return None
