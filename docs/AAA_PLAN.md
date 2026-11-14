> **Superseded (2026-11-13):** o rig R6 foi removido; R15 e o unico rig de personagem (ver docs/R15.md e docs/R6_REMOVAL_AUDIT.md, secao Done). As referencias a R6 abaixo sao historicas.

# Plano AAA — levar a engine ao nível de `docs/references/AAA/1.mp4`

## 1. O que o vídeo de referência faz (análise)

**Números**: 172 s · 2160x3840 · 60 fps · 142 planos (média 1,2 s; vários de 0,3-0,7 s). Hoje nossa média é 1 plano por fala (1,5-2,5 s).

**História**: narrador em 3ª pessoa ("Ryan..."), com falas citadas na legenda (`"Ryan?"`, `come!"`). Caixa preta gigante cai na cidade;
a cada ano a porta abre para um mundo diferente por 60 min; o pai some lá dentro; Ryan entra, acha o pai acorrentado numa ilha flutuante,
fogem de uma criatura colossal e saem no último segundo. Fecha com "happy birthday".
Roteiro: ~640 palavras (~3,7 palavras/s), 14 falas de diálogo citadas, contagem regressiva falada (47 s, 20, 10, 5) como motor de tensão,
sem CTA de inscrição. Transcrição com tempos: `docs/references/AAA/1.transcript.txt`; lista de cortes: `docs/references/AAA/1.shots.tsv`.

**Legenda**: 1-2 palavras, minúsculas, amarelo com contorno preto grosso, fixa em ~62% da altura. Sem título no topo.

**Mundos (12 ambientes em 172 s)**: subúrbio low-poly · praça de tijolo · monólito preto com painéis de glifos dourados + relógio de 7 segmentos ·
selva · cidade dourada · oceano com planetas e baleia · quarto · mundo de gelo com gigantes de gelo · túnel-arquivo dourado com chão molhado ·
porta dourada ornamentada · ilha flutuante sobre mar de nuvens com cachoeira e estátua dourada · pátio de pedra (prisão).

**Céu**: skybox fotográfico com nuvens volumosas (não gradiente). Pelo menos 6 céus: azul dia, roxo com planetas, nebulosa noturna,
dourado (flashback), tempestade escura, pôr do sol. O céu muda dentro da mesma locação (escurece quando a criatura chega).

**Luz e material**: sol duro com sombra nítida, cores saturadas, bloom forte, flare/estouro do sol, raios de luz (porta, fundo do mar),
PBR real (tijolo e pedra com normal map, ouro metálico, chão molhado refletindo), aberração cromática e vinheta nas bordas, grade por momento
(flashback amarelo, ameaça dessaturada/escura).

**Câmera** (a maior diferença): grande-angular (FOV ~90-100) colada no chão ou no rosto · voo FPV atravessando a cena · whip-pan com motion blur
como transição · crash-zoom · dutch tilt · POV (olhando o relógio no pulso, segurando o porta-retrato) · tracking atrás de quem corre ·
top-down · contra-plongée em tudo que é grande. Vários planos por frase: corte a cada 2-3 palavras.

**Personagens**: R6 blocado (igual ao nosso rig), roupa clássica real do catálogo + acessórios 3D (mochila, saco de dormir, barba, cabelo),
relógio de pulso com contagem regressiva viva. Rostos 2D muito expressivos: pupilas que apontam, sobrancelhas, dentes, boca gritando, lágrima.

**Atuação**: correr inclinado, cavar, descer escada/alçapão, puxar porta, braços acorrentados, soltar corrente, abraçar, carregar criança no ombro,
cair e rolar, deitar lado a lado, mergulhar por uma porta. São interações entre dois corpos e com o cenário, não poses isoladas.

**Set-pieces e VFX**: objeto colossal caindo + colunas de fumaça volumétrica + destroços + multidão de centenas · portal mostrando outro mundo
dentro da moldura · gelo rachando · criatura colossal com dezenas de olhos emissivos · folhas/neve/poeira no ar o tempo todo.

## 2. Onde a engine está hoje (lacunas)

| Área | Hoje | Falta |
|---|---|---|
| Céu | gradiente 4x512 em `scene.background` | skybox equirect/cubemap, rotação, troca e blend no meio da cena, IBL coerente |
| Planos | 1 câmera por cena, 1 cena por fala | `shots[]` dentro da cena, cortes por palavra, trilhos de câmera, POV, whip-pan, FOV largo, roll |
| Luz/post | Neutral tone map, bloom, DOF, 1 sombra 4096 | CSM para cenas grandes, god rays, flare, aberração, vinheta, grade/LUT por plano, SSR ou reflexo planar |
| Materiais | procedurais lisos | PBR com normal/roughness (tijolo, pedra, ouro, gelo, água) |
| Mundos | sets procedurais 34x28 + kits Polyfork | cenários em escala (monólito, ilhas, mar de nuvens, túnel), portais, interiores fechados |
| Rig | R6, 6 juntas, ~45 anims | mais anims (import de KeyframeSequence R6 do Studio), anexar ator a ator/objeto (carregar, abraçar, corrente), root motion |
| Rosto | atlas 4x8, olhos fixos | pupilas direcionáveis, sobrancelha separada, mais bocas, lágrima, rosto estilo "olho grande" da referência |
| VFX | partículas simples | fumaça volumétrica (sprites animados), destroços, rachadura, feixes de luz, emissivos |
| Multidão | 24 + 8 | centenas via instancing (vista de longe) |
| Criaturas | 18 animais GLB | criaturas colossais com rig (gigante de gelo, inseto de olhos) |
| Texto em cena | fx timer/label | display 7 segmentos em superfície e relógio de pulso sincronizados com um relógio da história |
| Saída | 1080x1920@30 | 60 fps, opção 4K |
| Narração | 1ª pessoa, CTA obrigatório | formato novo: 3ª pessoa, falas citadas, legenda minúscula amarela |

O rig R6 não precisa virar R15: a referência é R6. O ganho está em câmera, mundo, céu e luz.

## 3. Fases (cada uma termina com render do benchmark)

**Benchmark**: `tests/stories/_aaa_bench` = os primeiros 25 s da referência (queda da caixa, porta, mundos, relógio), refeitos plano a plano.
Ao fim de cada fase: render + folha de contato lado a lado com a referência. É o critério de pronto.

### Fase 1 — Câmera e montagem (maior retorno)
1. `shots[]` por cena: `[{at:"@word"|s|%, cam:"..."}]`; a fala continua uma só, o render corta dentro dela. Cache por cena permanece.
2. Trilhos: `path:[pontos]` (Catmull-Rom) com `lookAt` ator/ponto, easing, velocidade; presets `fly`, `track:<id>`, `pov:<id>`, `whip`, `crash`, `dutch`.
3. Lentes: FOV até 100, `roll`, câmera a 0,3 u do chão, `near` curto; motion blur já existe (aumentar shutter no whip).
4. Lint: aviso se plano > 2,5 s; `--preview` passa a gerar 1 tile por plano.
5. Saída 60 fps (`format.fps`) e escala 4K opcional.

### Fase 2 — Céu, luz e pós
1. Skybox: `sky: "<nome>"` por loc/cena/plano, equirect 8k em `assets/sky/`, rotação, exposição, `scene.environment` derivado (PMREM) para IBL.
   Catálogo inicial: day_cumulus, purple_planets, night_nebula, golden, storm, sunset. Fonte: Poly Haven (CC0) + céus estilizados gerados.
2. Blend de céu/luz no meio da cena (`sky@word`), usado em "o céu escureceu".
3. CSM (3 cascatas) para planos abertos; sombra de contato nos pés.
4. Pós: god rays (radial a partir do sol/porta), lens flare, aberração cromática, vinheta, `grade` por plano (LUT: flashback, threat, cold, gold).
5. Materiais PBR: biblioteca `assets/pbr/` (brick, cobble, stone, gold, ice, wet) com normal/roughness; chão molhado com reflexo planar.

### Fase 3 — Mundos e set-pieces
1. `world` builder: terreno/ilhas flutuantes, mar de nuvens, oceano, túnel repetido, estruturas colossais (escala 50-200 u), fog por altura.
2. Portal: moldura que renderiza outra loc (render target + stencil), com vórtice animado e "atravessar".
3. Painéis de glifos dourados (textura gerada + emissivo), display 7 segmentos (`clock` global da história: superfície, relógio de pulso, HUD).
4. VFX: fumaça volumétrica (flipbook), destroços com gravidade pré-calculada, rachadura no chão, feixes de luz, olhos emissivos.
5. Multidão instanciada (até ~400, LOD R6 simplificado) com `flee`/`gather`.
6. Criaturas colossais: importar/gerar GLB com rig (Studio `generate_mesh`, Sketchfab CC, Polyfork) + anims idle/walk/attack.

### Fase 4 — Atuação
1. Importador `tools/roblox studio/export_anim.luau` -> `config/anims.json`: KeyframeSequence R6 (Motor6D CFrames) para nossas 6 juntas + root.
   Baixar pacote base pelo Studio: run inclinado, climb, dig, pull, push, crawl, fall, roll, swim, carry, hug, kneel, reach.
2. Vínculos: `attach:<id>:<ponto>` (carregar no ombro, mãos dadas, abraço), `chained`, IK simples de mão para alvo (maçaneta, corrente, pulso).
3. Rosto v2: camadas separadas (olhos brancos + pupila com `gaze`, sobrancelha, boca), 12 bocas, lágrima escorrendo, estilo "big-eye" como opção de cast.
4. Acessórios 3D que faltam (mochila com saco de dormir, barba, relógio) pelo pipeline `tools/assets/roblox_wear.py`.

### Fase 5 — Formato e produção
1. `config/formats/aaa_story/` (3ª pessoa, falas citadas, sem CTA forçado, 130-175 s, 120-150 planos) + estilo de legenda `lower_yellow`.
2. Atualizar AGENTS.md, REFERENCE.md, `--vocab`, lint e a skill `/short` com `shots`, `sky`, `world`, `portal`, `clock`, `attach`, `grade`.
3. Render final do benchmark completo (172 s) e comparação.

## 4. Orquestração (custo de tokens)

- **Fable (orquestrador)**: desenho de API (`shots`, trilhos, portal, world), revisão de diffs, olhar as folhas de contato, decidir.
- **Sonnet (subagente)**: implementação de cada item de engine com spec fechada (1 item = 1 arquivo/área), regressão `_*test`.
- **Haiku / Gemini CLI**: baixar e catalogar céus/PBR/modelos, converter anims, atualizar CATALOG.md e docs, gerar texturas de glifo, sweeps de lint.
- **Studio (MCP)**: baixar animações R6 e acessórios, exportar KeyframeSequence e OBJ; nunca renderizar.
- Itens da mesma fase que mexem em arquivos distintos rodam em paralelo; `world.js` (570 linhas, tudo junto) é o gargalo:
  primeiro passo da Fase 1 é parti-lo em `camera.js`, `sky.js`, `post.js`, `stage.js` para permitir trabalho paralelo sem conflito.

## 5. Riscos
- Tempo de render: 60 fps x 8 sub-frames de blur x 4K = ~16x o custo atual. Mitigar com blur por velocidade (post) em vez de acumulação e 4K só no final.
- Portal + CSM + reflexo planar multiplicam passes: orçamento por plano, ligar só onde aparece.
- Sem git no projeto: iniciar repositório antes de partir `world.js`.
