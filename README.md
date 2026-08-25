# Orbit Energy — Amazfit Bip 6

Watchface para Amazfit Bip 6 (390 × 450), nas três variantes oficiais do
aparelho: `9765120`, `9765121` e `10158337`.

O mostrador é lido como duas órbitas: o anel externo carrega as 24 horas, o anel
interno os 60 minutos, e um marcador iluminado indica a posição atual em cada um.
À esquerda ficam frequência cardíaca, distância, passos, data e horas em pé;
embaixo, uma cápsula com temperatura, calorias, estresse e PAI.

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
| `watchface/index.js` | A watchface. Usa a API atual do Zepp OS (`@zos/ui`, `@zos/sensor`). |
| `watchface/layout.js` | **Gerado.** Coordenadas, cores e nomes de arquivo usados em tempo de execução. |
| `tools/design.cjs` | Fonte única de verdade: paleta, geometria dos anéis, ícones. |
| `tools/build-assets.cjs` | Desenha os SVGs, rasteriza para PNG e emite `layout.js`. |
| `tools/simulate.cjs` | Executa a watchface fora do relógio e rasteriza o resultado. |
| `tools/zoom.cjs` | Recorta e amplia um PNG para conferir detalhes. |
| `assets/default/` | **Gerado.** Não editar à mão — `npm run assets` sobrescreve tudo. |

`tools/` só roda no computador; os arquivos usam extensão `.cjs` justamente para
que o empacotador do Zeus não tente compilá-los junto com a watchface.

## Como o desenho é montado

Tudo que é estático — anéis, números das horas e dos minutos, ícones, divisórias,
a cápsula inferior — é assado em `bg.png` pelo gerador. Em tempo de execução
sobram 23 widgets: uma imagem de fundo, os dois marcadores orbitais, a barra de
frequência cardíaca, a onda da bateria e os textos dos valores.

Como `layout.js` é gerado pelo mesmo script que desenha o fundo, mudar um número
em `tools/design.cjs` reposiciona a arte e os widgets ao mesmo tempo. Não existe
coordenada duplicada entre o desenho e o código.

Os marcadores das órbitas são 84 sprites prontos (`hl/h00.png` … `hl/m59.png`):
a cada minuto o código só troca `src` e a posição de duas imagens.

### Ajustes comuns

- **Cores:** `C` em `tools/design.cjs`.
- **Proporção dos anéis:** `DIAL` em `tools/design.cjs`. A relação
  `rHour - rMin === hlHourR + hlMinR` garante que os dois marcadores nunca se
  sobreponham, nem às 00:00, quando apontam para o mesmo lado.
- **Dias da semana em português:** array `WEEKDAYS` em `watchface/index.js`.

Depois de qualquer ajuste, rode `npm run assets`.

## Verificação sem o relógio

```powershell
node tools/simulate.cjs 18 19 --aod
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

## Always-On Display

O estado AOD mostra apenas o mostrador orbital em cinza, centralizado na tela,
com a hora digital no meio. Os widgets são marcados com `show_level`, então os
dois estados convivem no mesmo arquivo.

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
