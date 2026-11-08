# Fonte de identidade — Capture It

Licença: `LICENSE-capture-it.txt` (Koczman Bálint): uso pessoal e comercial permitido; não pode ser vendida diretamente.

Coloque aqui o arquivo da fonte com um destes nomes (o primeiro encontrado é usado):

- `capture-it.woff2` (recomendado — menor)
- `capture-it.woff`
- `capture-it.ttf`

O carregamento é automático (`src/styles/brand-font.ts`): se o arquivo existir, a família **"Capture It"** é registrada
via FontFace e usada em `font-brand` (marca "Central de Comando" e títulos principais). Se não existir, os títulos
usam **Barlow Condensed** sem erro. A fonte é apenas embutida para exibição — não há link de download no sistema.
