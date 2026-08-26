# Orbit Energy — Amazfit Bip 6

Watchface para Amazfit Bip 6 (390 × 450), nas três variantes oficiais do
aparelho: `9765120`, `9765121` e `10158337`.

O mostrador fica ancorado no canto superior direito e é lido como duas órbitas:
o anel externo carrega as 24 horas, o anel interno as marcas de 5 minutos, e um
marcador iluminado indica a posição atual em cada um. Os dois crescem *para
dentro*, em direção ao centro.

A pegada do mostrador é um disco de raio `rHour + hourOverhang`, e por ser um
disco ele pode encostar na borda de cima e na da direita por mais arredondado
que seja o canto do display: erodir um retângulo arredondado por um raio maior
que o do canto deixa um retângulo reto. Quem limita, então, são só os blocos
(terminam em `x=112`) e a faixa do meio (começa em `y=280`) — e o lado
horizontal aperta primeiro, em 136 px de alcance. Daí para dentro cabem 80 px
de diâmetro na hora e 56 px no minuto, encostando um no outro sem se sobrepor.

A **soma** dos dois raios é que está presa: como um marcador vai de
`O - 2·Rh` até `O` e o outro de `minOuter - 2·Rm` até `minOuter`, não se
sobrepor exige `Rh + Rm ≤ (O - buraco central) / 2`. Hoje isso está no limite,
com o buraco central em zero — o marcador do minuto encosta exatamente no
centro do mostrador. Então crescer um dos dois custa de um destes três lugares:

| Lever | Câmbio |
| --- | --- |
| Estreitar a coluna da esquerda | 2 px de bloco → 1 px de alcance → 1 px de diâmetro |
| Encolher o anel dos minutos | 1 px de `rMin` → 1 px de diâmetro na hora, 1 px a menos no minuto |
| Encolher o marcador do minuto | troca direta, 1 por 1 |

Encolher a cápsula de baixo não ajuda enquanto o lado horizontal for o que
aperta.

Os indicadores são blocos: frequência cardíaca, distância e passos à esquerda;
data e bateria na faixa do meio; temperatura, calorias, estresse e PAI na
cápsula inferior. Cada bloco é tocável e abre o aplicativo de sistema
correspondente.

## Comandos

```powershell
npm run assets
```

Regenera todos os PNGs de `assets/default/` e reescreve `watchface/layout.js`.

```powershell
npm run build
```

Regenera os assets e empacota em `dist/*.zab` (`zeus build --ip false`).

```powershell
npm run dev
```

Regenera os assets e envia para o simulador, recompilando a cada alteração.
O simulador precisa estar aberto **com o dispositivo Bip 6 iniciado** — se ele
estiver apenas aberto, os arquivos são copiados mas nada aparece na tela.

`npm run login` autentica a conta Zepp, `npm run status` confirma login e conexão
com o simulador, e `npm run preview` gera o QR code para instalar no relógio.
No celular, habilite o modo desenvolvedor em **Perfil → Configurações → Sobre**,
tocando sete vezes no ícone do Zepp.

> **Atenção:** o `zeus dev` reescreve o `.gitignore` com os defaults dele a cada
> execução, apagando as entradas do projeto (ele lê errado o retorno do
> `parse-gitignore@2`). As mesmas regras estão duplicadas em
> `.git/info/exclude`, que o Zeus não toca, então o Git continua ignorando o que
> deve mesmo depois de o arquivo ser sobrescrito.

## Estrutura

| Caminho | Papel |
| --- | --- |
| `watchface/index.js` | A watchface. Usa a API atual do Zepp OS (`@zos/ui`, `@zos/sensor`, `@zos/router`). |
| `watchface/layout.js` | **Gerado.** Coordenadas, cores e nomes de arquivo usados em tempo de execução. |
| `tools/design.cjs` | Fonte única de verdade: paleta, geometria dos anéis, tabela de blocos, ícones. |
| `tools/build-assets.cjs` | Desenha os SVGs, rasteriza para PNG e emite `layout.js`. |
| `tools/simulate.cjs` | Executa a watchface fora do relógio, confere as zonas de toque e rasteriza o resultado. |
| `tools/zoom.cjs` | Recorta e amplia um PNG para conferir detalhes. |
| `tools/measure-text.cjs` | Mede a tinta de um texto num print do aparelho, para dimensionar as caixas pela fonte real do relógio. |
| `tools/diff-device.cjs` | Compõe o esperado e compara com um print do aparelho, marcando as diferenças. |
| `tools/fonts/` | Fonte vendorizada para os marcadores (Instrument Serif, SIL OFL) e sua licença. |
| `assets/default/` | **Gerado.** Não editar à mão — `npm run assets` sobrescreve tudo. |

`tools/` só roda no computador; os arquivos usam extensão `.cjs` justamente para
que o empacotador do Zeus não tente compilá-los junto com a watchface.

## Como o desenho é montado

Tudo que é estático — anéis, números das horas e dos minutos, ícones, os blocos,
a cápsula inferior — é assado em `bg.png` pelo gerador. Em tempo de execução
sobram 33 widgets: uma imagem de fundo, os dois marcadores orbitais, a barra de
frequência cardíaca, a onda da bateria, os textos dos valores e as 10 zonas de
toque.

Como `layout.js` é gerado pelo mesmo script que desenha o fundo, mudar um número
em `tools/design.cjs` reposiciona a arte e os widgets ao mesmo tempo. Não existe
coordenada duplicada entre o desenho e o código.

Os marcadores das órbitas são 84 sprites prontos (`hl/h00.png` … `hl/m59.png`).
Eles são **recriados**, não movidos — assim o widget novo entra no fim da lista
de desenho, que é onde esses marcadores devem estar: **acima de todo o resto**.

### O falso limite de tamanho

Um marcador de 56×56 já voltou do aparelho desenhado só no seu canto superior
esquerdo de 48×48, enquanto o de 52×52 ao lado, atualizado do mesmo jeito no
mesmo quadro, estava perfeito. Parecia um teto de tamanho, e por um tempo o
projeto ficou preso em 52 px por causa disso.

Não era. O `bg.png` tem 390×450 e nunca trunca. O que diferia entre os dois
marcadores era **quando** cada um tinha sido atualizado pela última vez: a hora
virou às 14:00, quase certamente com a tela apagada; o minuto, 17 segundos antes
da captura, com ela ligada. Atualização que acontece com a tela apagada não
chega a ser desenhada — o mesmo defeito que fazia o minuto parecer congelado. O
`resume_call` do `WIDGET_DELEGATE` redesenha tudo ao acordar, e com isso o
tamanho voltou a ser livre.

`MAX_SPRITE` continua em `tools/design.cjs`, agora em 80, como alarme e não como
limite físico. `checkGeometry()` roda a cada `npm run assets` e quebra o build se
um sprite passar disso ou se os dois marcadores puderem se sobrepor.

### Ajustes comuns

- **Cores:** `C` em `tools/design.cjs`.
- **Proporção dos anéis:** `DIAL` em `tools/design.cjs`. Como os marcadores
  crescem para dentro, a folga entre eles é
  `rHour + hourOverhang - 2*hlHourR - (rMin + minOverhang)`; mantenha esse valor
  em zero ou mais e eles nunca se sobrepõem, nem às 00:00, quando apontam para o
  mesmo lado.
- **Blocos e zonas de toque:** a tabela `SLOTS` em `tools/design.cjs`. Cada
  entrada define a caixa do bloco, o ícone, o tamanho do valor e o campo `app`,
  que é o aplicativo de sistema que um toque abre.
- **Dias da semana em português:** array `WEEKDAYS` em `watchface/index.js`.
- **Tipografia dos marcadores:** `markerFont`, `markerBaseline`,
  `markerStroke` e `markerFontRatio` em `tools/design.cjs`. Os números da hora
  e do minuto usam **Instrument Serif** (SIL OFL, vendorizada em `tools/fonts/`
  com a licença). Só o gerador precisa dela — os marcadores viram sprites PNG,
  então o relógio nunca resolve fonte nenhuma. Cada face assenta diferente na
  linha de base, daí o `markerBaseline` (0.365 em, contra 0.35 da Segoe).
- **Peso dos marcadores:** a Instrument Serif não tem Bold, e crua ela é fina
  demais para esta tela — só 9% da tinta sobrevive a uma erosão de 2 px, contra
  55% da Segoe UI Bold. O `markerStroke` (2,4) desenha um contorno na cor do
  preenchimento por baixo dele, engrossando as letras para 38%: fica entre a
  Semibold e a Bold da Segoe, mantendo a serifa, ao custo de um ponto de
  tamanho.
- **Tamanho dos números dos marcadores:** `markerFontRatio` é uma fração do
  diâmetro do círculo, então acompanha o marcador. Está em 0.8125, o limite com
  esse contorno, e é aplicado com `Math.floor` — o valor é limitado por
  encaixe, então o lado conservador é o certo. `checkMarkerFit()` desenha o par
  de dígitos que chega mais longe do centro (`04`), já com o contorno, e quebra
  o build se ele encostar no anel.

> Um estilo sem anel — disco liso na cor dos blocos e o número transbordando
> para os lados — foi testado e revertido. Sem contorno, os dois marcadores
> leem como um número de quatro dígitos sempre que se alinham; às 06:15, `15` e
> `06` viram `1506`. O anel é o que separa os dois.

> `text_style.NONE` é o **letreiro rolante** (跑马灯), não "sem tratamento".
> Qualquer texto tão largo quanto a caixa fica rolando para sempre. Os valores
> usam `ELLIPSIS`, e as caixas são dimensionadas com medições feitas na fonte
> real do relógio via `tools/measure-text.cjs`.

Depois de qualquer ajuste, rode `npm run assets`.

## Verificação sem o relógio

```powershell
node tools/simulate.cjs 14 20 --aod
```

Carrega `watchface/index.js` com os módulos `@zos` substituídos por stubs, roda
o ciclo de vida real (`onInit` → `build` → `onPerMinute`), confere que todo
asset referenciado existe e que nenhum widget sai da tela, e grava o resultado em
`.render/`. É o mesmo código que roda no relógio, então erros de layout e de
caminho de arquivo aparecem aqui.

Para testar valores extremos:

```powershell
$env:SIM='{"steps":98765,"heartRate":0,"battery":3}'; node tools/simulate.cjs 9 7
```

`SIM_BARE=1` remove do stub tudo que o `@zos/ui` pode não expor
(`deleteWidget`, `IMG_CLICK`, `prop.VISIBLE`) e exercita os caminhos
alternativos:

```powershell
$env:SIM_BARE='1'; node tools/simulate.cjs 14 20
```

## Toque

Cada bloco tem uma zona invisível por cima (`IMG_CLICK` com um PNG transparente
do tamanho exato do bloco) que chama `launchApp` do `@zos/router`:

| Bloco | Abre |
| --- | --- |
| Freq. cardíaca | `SYSTEM_APP_HR` |
| Distância, Passos, Kcal | `SYSTEM_APP_STATUS` |
| Data | `SYSTEM_APP_CALENDAR` |
| Bateria | `SYSTEM_APP_SETTING` |
| Temp | `SYSTEM_APP_WEATHER` |
| Stress | `SYSTEM_APP_PRESSURE` |
| PAI | `SYSTEM_APP_PAI` |

Não existe `SYSTEM_APP_BATTERY`; as configurações são o mais próximo disso.
`node tools/simulate.cjs` dispara todas as zonas e lista qual aplicativo cada
uma abriria.

`IMG_CLICK` **não recebe callback.** Ele recebe um `type` vindo de `data_type`,
e o firmware decide sozinho para onde saltar — é assim que as watchfaces de
fábrica fazem. Passar `click_func` para ele não dá erro, simplesmente não faz
nada. Só a data não tem métrica correspondente, então ela usa um `BUTTON` com
`click_func` chamando o `launchApp` do `@zos/router`.

Nem `IMG_CLICK` nem os `data_type` de watchface (`STEP`, `STRESS`, `PAI_DAILY`,
`WEATHER_CURRENT`) aparecem nas tipagens do `@zos/ui`, mas existem no aparelho —
o Bip 6 reporta `IMG_CLICK = 17`. Cada um é checado antes do uso; sem o tipo, a
zona vira `BUTTON`.

**O `src` do `IMG_CLICK` é desenhado o tempo todo, não só ao pressionar.** A
documentação diz "imagem exibida ao clicar", o que sugere realce de toque — mas
na prática ele fica permanente. Por isso os arquivos em `assets/default/hit/`
são 100% transparentes, e o harness recusa qualquer um que tenha um pixel
visível: bastaria um para virar uma caixa desenhada por cima do bloco.

**Não existe `hmUI` global neste firmware.** A watchface oficial extraída em
`reference/` usa `hmUI.*` porque foi compilada com o toolchain antigo, que
injetava esse objeto; num build atual do Zeus ele simplesmente não está lá, e
tocar nele derruba a tela inteira. Tudo tem que sair do `@zos/*`.

Ao iniciar, a watchface escreve no console quantas zonas de cada tipo criou e o
que encontrou na API. No Bip 6 a linha é:

```
orbit: 8 IMG_CLICK zones, 1 buttons (IMG_CLICK=17, deleteWidget=true)
```

Se aparecerem 0 zonas `IMG_CLICK`, os `data_type` sumiram e tudo caiu para
`BUTTON`. Toques em botões registram `orbit: tap <bloco>`:

```powershell
Get-Content "$env:LOCALAPPDATA\Programs\simulator\sim-debug.log" -Tail 40 | Select-String orbit
```

## Atualização

Três coisas mantêm os valores em dia, porque nenhuma sozinha basta:

- `time.onPerMinute` — o tique exato no segundo 00.
- `WIDGET_DELEGATE` com `resume_call` — **essencial**. O `onPerMinute` é
  suspenso enquanto a tela está apagada e não dispara ao acordar, então sem esse
  gancho o marcador do minuto fica parado alguns minutos atrás até a próxima
  virada com a tela ligada.
- Um `createSysTimer` de 30 s, iniciado no `resume_call` e parado no
  `pause_call`, que repolla tudo enquanto a tela está acesa.

Os dois medidores — a barra de frequência cardíaca e a onda da bateria — são
tiras de 21 imagens (`meter/hr/00.png` … `meter/battery/20.png`) trocadas por
`src`. Redimensionar um widget vivo com um `setProperty(MORE, {w})` parcial não
funciona de forma confiável neste firmware; trocar `src` funciona.

## Always-On Display

O estado AOD mostra apenas o mostrador orbital em cinza, centralizado e maior —
sem os blocos há espaço para isso, e o anel interno mais largo deixa o meio livre
para a hora digital. Ali os marcadores ficam *em cima* dos anéis, em vez de
crescerem para dentro. Os widgets são marcados com `show_level`, então os dois
estados convivem no mesmo arquivo.

## Temperatura

`@zos/sensor` não expõe a temperatura atual — apenas máxima e mínima da previsão.
A célula "Temp" usa então um widget `TEXT_IMG` ligado a
`data_type.WEATHER_CURRENT`, que desenha o valor a partir dos dígitos em
`assets/default/temp/`. É o mesmo mecanismo das watchfaces oficiais. Se o
binding não estiver disponível, a célula fica vazia em vez de derrubar a tela.

## Arquivos de referência

- `reference/target-mockup.png`: o desenho alvo (paleta extraída dele por
  `tools/sample-colors.cjs`).
- `reference/expressive-energy-orange.png`: captura da watchface Expressive Energy.
- `reference/original-package/`: pacote original extraído. Os arquivos `.png` ali
  já estão no formato interno da Zepp — são referência de estrutura, não imagens
  editáveis.
