import re
from services.whatsapp_parser import _parse_line

lines = [
    "[24/04/2026, 17:33:18] Cristiane Cicatrize: <anexado: 00000027-AUDIO-2026-04-24-17-33-18.opus>",
    "[24/04/2026, 17:33:57] paulo goldner: Okay, aguardo",
    "[24/04/2026, 17:34:11] Cristiane Cicatrize: <anexado: 00000029-AUDIO-2026-04-24-17-34-11.opus>"
]

for l in lines:
    print(_parse_line(l))
