# Fonte de identidade — Capture It

Licença: `LICENSE-capture-it.txt` (Koczman Bálint): uso pessoal e comercial permitido; não pode ser vendida diretamente.

Arquivo em uso: `capture-it.woff2` (39 KB) — gerado do `Capture_it.ttf` original (727 KB) com subconjunto latino
(U+0020–007E, U+00A0–00FF e pontuação tipográfica: todos os acentos do português), sem alterar os desenhos.
Comando usado: `pyftsubset Capture_it.ttf --unicodes="U+0020-007E,U+00A0-00FF,U+2013-2014,U+2018-201E,U+2022,U+2026,U+20AC" --flavor=woff2 --layout-features='*'`

Para trocar, coloque o arquivo com um destes nomes (o primeiro encontrado é usado):

- `capture-it.woff2` (recomendado — menor)
- `capture-it.woff`
- `capture-it.ttf`

O carregamento é automático (`src/styles/brand-font.ts`): se o arquivo existir, a família **"Capture It"** é registrada
via FontFace e usada em **todo o texto da Central** (`font-sans`, `font-display` e `font-brand`, no Tailwind). Caracteres
que a fonte não tem caem letra a letra para a próxima da lista; se o arquivo não existir, o app usa **Inter** (texto) e
**Barlow Condensed** (títulos) sem erro. A fonte é apenas embutida para exibição — não há link de download no sistema.
