### Novidades

- **Marketplace oficial de plugins e guia de contribuição**: O Voyager agora traz uma marketplace de plugins integrada. Qualquer pessoa pode publicar um plugin seguindo o [guia de contribuição](https://voyager.nagi.fun/guide/plugin-contribution) — comece por um plugin declarativo CSS + JSON, sem precisar compilar a extensão. Veja-os na [Plugin Store](https://voyager.nagi.fun/plugins).
- **Plugin nativo «Copiar fórmulas»** *(desativado por padrão, ative quando precisar)*: Um novo plugin oficial «Copiar fórmulas» vem incluído na extensão, mas permanece **desativado** até você ligá-lo — enquanto estiver desligado, não faz absolutamente nada. Para usá-lo, abra a secção de Plugins do popup e ative o interruptor do site correspondente (Claude ou ChatGPT). O navegador mostrará um único diálogo de autorização para conceder ao Voyager o acesso àquele site. Depois de aceitar, clique numa fórmula na página e ela será copiada como LaTeX em Markdown. Não há qualquer ativação silenciosa: o diálogo de autorização é o único passo de «configuração».
- **Metadados dos plugins localizados**: O nome e a descrição dos plugins agora seguem o idioma do popup; os cartões da marketplace no site também.

### Correções

- **Âncora da marca d'água movida pelo Gemini**: O removedor de marca d'água foi readaptado à nova posição da âncora do Gemini — o relato de alta taxa de falhas do 1.4.7 está resolvido.
- **Desmontagem completa da marca d'água**: `stopWatermarkRemover` libera agora todos os observers, timers e listeners que criou, de modo que desativá-la não deixa um estado «processando» preso.
- **Área de clique do toggle da barra lateral**: Restaurada a área de clique ampliada do toggle da barra lateral recolhida, que tinha sido revertida no lançamento anterior.
- **Títulos ao arrastar pastas**: Os títulos durante o arrasto agora seguem o estilo nativo do Gemini, tanto no AI Studio quanto no hover do histórico.
- **Seletor de pasta para cima**: O seletor de projeto de pasta abre-se agora para cima quando não há espaço abaixo.
- **Texto «Remover da pasta»**: A mensagem de confirmação é mais clara — você está removendo a conversa da pasta, não apagando a pasta.
- **Ativação do tooltip da timeline**: Os tooltips esperam agora um hover explícito, em vez de piscar a cada scroll.
- **Porta de permissões opcionais no Firefox**: Utilizadores de Firefox 116+ podem voltar a conceder permissões opcionais (regressão do patch para Fx<128).
- **Restauração de backups duráveis no Safari**: A restauração grava agora em armazenamento durável, evitando perder backups de pastas na janela de 7 dias do ITP.
- **Idioma do toast de «Copiar fórmula»**: O toast de sucesso segue o idioma da interface escolhido, e não a locale do navegador.
- **Acessibilidade**: Sliders, switches e ratings já têm aria-labels adequados, e `eslint-plugin-jsx-a11y` é aplicado na CI.

### Desempenho

- **Carga preguiçosa de KaTeX e JSZip**: KaTeX e JSZIP deixam de integrar o bundle do content-script — só carregam quando precisos (pré-visualização de matemática, export de imagem).
- **Carga diferida de marked + KaTeX na pré-visualização de prompts**: A pré-visualização markdown deixa de fazer parse de fórmulas ao abrir o popup.
- **Inicialização da marca d'água em diferido**: A inicialização do observer passa a ser entregue a `requestIdleCallback`, melhorando o primeiro render.
- **Saltar reescrita vazia no isolamento de conta**: Não se reescreve o profile-map quando nada mudou.
