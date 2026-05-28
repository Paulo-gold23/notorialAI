# -*- coding: utf-8 -*-
"""
Script de teste ao vivo: empacota test_archives em ZIP e roda parse_whatsapp_zip.
Mostra EXATAMENTE o que o parser produz: cada mensagem, tipo, remetente e arquivo.
"""
import sys
import io as _io
sys.stdout = _io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = _io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
import sys
import os
import io
import zipfile
import json

# Garante que importa do diretório atual (notorial-api)
sys.path.insert(0, os.path.dirname(__file__))

from services.whatsapp_parser import parse_whatsapp_zip

TEST_DIR = os.path.join(os.path.dirname(__file__), '..', 'test_archives')
TEST_DIR = os.path.abspath(TEST_DIR)

print(f"\n{'='*60}")
print(f"TEST_ARCHIVES em: {TEST_DIR}")
print(f"Arquivos presentes:")
files = os.listdir(TEST_DIR)
for f in sorted(files):
    print(f"  - {f}")

# ── Cria ZIP em memória com todos os arquivos ─────────────────
buf = io.BytesIO()
with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
    for fname in files:
        fpath = os.path.join(TEST_DIR, fname)
        if os.path.isfile(fpath):
            zf.write(fpath, fname)
zip_bytes = buf.getvalue()
print(f"\nZIP criado: {len(zip_bytes):,} bytes com {len(files)} arquivos\n")

# ── Roda parser ────────────────────────────────────────────────
result = parse_whatsapp_zip(zip_bytes)

print(f"{'='*60}")
print(f"RESULTADO DO PARSER")
print(f"{'='*60}")
print(f"Participantes: {result['participantes']}")
print(f"Período: {result['periodo']}")
print(f"Total msgs: {result['total_mensagens']}")
print(f"Total áudios: {result['total_audios']}")
print(f"Total imagens: {result['total_imagens']}")
print(f"Imagens extraídas (bytes): {len(result.get('imagens_extraidas', {}))}")
print(f"Áudios extraídos (bytes): {len(result.get('arquivos_extraidos', {}))}")
print(f"\n{'='*60}")
print(f"MENSAGENS DETALHADAS (linha a linha)")
print(f"{'='*60}\n")

for i, msg in enumerate(result['mensagens'], 1):
    tipo   = msg.get('tipo', '?')
    rem    = msg.get('remetente', '?')
    data   = msg.get('data', '')
    hora   = msg.get('hora', '')
    arq    = msg.get('arquivo', '')
    cont   = msg.get('conteudo', '')[:60]
    marca = {
        'texto':        '💬',
        'imagem':       '🖼️ ',
        'audio':        '🎙️ ',
        'video':        '🎥',
        'midia_omitida':'❌',
        'arquivo':      '📄',
        'figurinha':    '🎭',
    }.get(tipo, '❓')
    print(f"  [{i:02d}] {marca} [{data} {hora}] {rem}")
    if tipo == 'imagem':
        print(f"         ↳ arquivo: {arq or '⚠️  SEM ARQUIVO!'}")
    elif tipo == 'audio':
        print(f"         ↳ arquivo: {arq or '⚠️  SEM ARQUIVO!'}")
    elif tipo == 'texto':
        print(f"         ↳ {cont!r}")
    elif tipo == 'arquivo':
        print(f"         ↳ doc: {arq}")

print(f"\n{'='*60}")
imagens = result.get('imagens_extraidas', {})
audios  = result.get('arquivos_extraidos', {})

print(f"\n✅ IMAGENS EXTRAÍDAS ({len(imagens)}):")
for k in sorted(imagens.keys()):
    print(f"   - {k}: {len(imagens[k]):,} bytes")

print(f"\n✅ ÁUDIOS EXTRAÍDOS ({len(audios)}):")
for k in sorted(audios.keys()):
    print(f"   - {k}: {len(audios[k]):,} bytes")

# ── Verificações críticas ───────────────────────────────────────
print(f"\n{'='*60}")
print("VERIFICAÇÕES CRÍTICAS")
print(f"{'='*60}")

msgs_imagem = [m for m in result['mensagens'] if m.get('tipo') == 'imagem']
msgs_audio  = [m for m in result['mensagens'] if m.get('tipo') == 'audio']

# 1. Imagens com arquivo associado
imgs_com_arq = [m for m in msgs_imagem if m.get('arquivo')]
print(f"\n🔍 Mensagens do tipo 'imagem': {len(msgs_imagem)}")
print(f"   - Com arquivo associado: {len(imgs_com_arq)}")
print(f"   - Sem arquivo (bug!):    {len(msgs_imagem) - len(imgs_com_arq)}")

# 2. Remetente correto nos áudios
print(f"\n🔍 Áudios detectados: {len(msgs_audio)}")
for m in msgs_audio:
    print(f"   - [{m['data']} {m['hora']}] Remetente: '{m['remetente']}' | arquivo: {m.get('arquivo','?')}")

# 3. Verificar se áudio foi atribuído ao remetente errado
paulo_audios = [m for m in msgs_audio if 'paulo' in m.get('remetente','').lower()]
if paulo_audios:
    print(f"\n❌ BUG DETECTADO: áudios atribuídos ao Paulo (ERRADO):")
    for m in paulo_audios:
        print(f"   - {m}")
else:
    print(f"\n✅ Nenhum áudio incorretamente atribuído ao Paulo.")

# 4. Total de imagens no ZIP vs detectadas
img_no_zip = [f for f in files if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
print(f"\n🔍 Imagens no ZIP: {len(img_no_zip)}")
print(f"   Detectadas pelo parser: {len(msgs_imagem)}")
if len(msgs_imagem) == len(img_no_zip):
    print(f"   ✅ Contagem CORRETA!")
else:
    print(f"   ❌ CONTAGEM ERRADA! {len(img_no_zip) - len(msgs_imagem)} imagem(ns) perdida(s)")

print(f"\n{'='*60}\n")
