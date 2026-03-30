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
                r'<p>(?=(?:.*?<a[^>]+href="#[^"]+"[^>]*>){3,})(.*?)</p>',
                r'<p class="indice-inline-colunas">\1</p>',
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
    """
    content = _format_index_as_columns(html_str)

    if "<html" in content.lower():
        # Documento completo: injeta apenas os estilos necessarios.
        style_block = """
<style>
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
  margin-bottom: 2px;
}
</style>
"""
        return re.sub(r"</head>", style_block + "</head>", content, count=1, flags=re.IGNORECASE)

    return f"""<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {{
      font-family: "Times New Roman", Times, serif;
      font-size: 12pt;
      line-height: 1.35;
      color: #111;
      margin: 24px;
    }}
    h1, h2, h3, h4, h5, h6 {{
      margin: 0.6em 0 0.35em;
      page-break-after: avoid;
    }}
    ul, ol {{
      margin: 0.25em 0 0.75em;
    }}
    .indice-colunas {{
      columns: 2;
      -webkit-columns: 2;
      column-gap: 24px;
      padding-left: 18px;
      margin-top: 4px;
    }}
    .indice-colunas li {{
      break-inside: avoid;
      margin: 0 0 2px 0;
    }}
    .indice-inline-colunas {{
      columns: 2;
      -webkit-columns: 2;
      column-gap: 24px;
    }}
    .indice-inline-colunas a {{
      display: block;
      margin-bottom: 2px;
    }}
  </style>
</head>
<body>
{content}
</body>
</html>"""


async def generate_pdf_from_html(html_str: str) -> bytes | None:
    """Consome a API do Gotenberg via URL do Env"""
    url = getattr(settings, 'PDF_CONVERTER_URL', getattr(settings, 'GOTENBERG_URL', "http://localhost:3000/forms/chromium/convert/html"))
    
    # Se não houver URL formatada pra chromium html, formatar
    if "convert/html" not in url:
         url = f"{url.rstrip('/')}/forms/chromium/convert/html"
         
    html_for_pdf = _wrap_html_for_pdf(html_str)
    files = {
        'files': ('index.html', html_for_pdf, 'text/html')
    }
    data = {
         'marginTop': 1,
         'marginBottom': 1,
         'marginLeft': 1,
         'marginRight': 1
    }
    
    try:
         async with httpx.AsyncClient() as client:
             response = await client.post(url, files=files, data=data, timeout=30.0)
             
         if response.status_code == 200:
             return response.content
         else:
             logger.error(f"Erro no Gotenberg {response.status_code}: {response.text}")
             return None
             
    except Exception as e:
         logger.error(f"Gotenberg exception: {e}")
         return None
