import os
from services.whatsapp_parser import _parse_line, _classify_message
from services.ai_organizer import _chat_to_text

lines = [
    "[24/04/2026, 17:33:18] Cristiane Cicatrize: <anexado: 00000027-AUDIO-2026-04-24-17-33-18.opus>",
    "[24/04/2026, 17:33:57] paulo goldner: Okay, aguardo",
    "[24/04/2026, 17:34:11] Cristiane Cicatrize: <anexado: 00000029-AUDIO-2026-04-24-17-34-11.opus>"
]

mensagens = []
for l in lines:
    parsed = _parse_line(l)
    if parsed:
        tipo, arquivo = _classify_message(parsed["conteudo"], set(), {})
        parsed["tipo"] = tipo
        parsed["arquivo"] = arquivo
        parsed["transcricao"] = "Transcrição teste" if tipo == "audio" else None
        mensagens.append(parsed)

chat_json = {"mensagens": mensagens}
chat_text, img_sched, audio_sched = _chat_to_text(chat_json)

print(chat_text)
print("AUDIO SCHED:", audio_sched)
