**Atualização importante — dedique um minuto para ler.** A interface web do Gemini acaba de receber uma reformulação importante, e esta versão reconstrói toda a extensão para o novo layout (barra lateral, seletor de modelo, painel de pastas, entrada Gems) para que sua configuração existente continue funcionando. As correções abaixo respondem a relatos reais das últimas 24 horas — se algo ainda estiver quebrado, espere uma correção rápida.

### Novidades

- **Lista de Gems recentes na barra lateral**: A entrada nativa de Gems expande para uma lista de seus gems recentes com acesso em um clique.
- **Bloqueio do nível de raciocínio**: A configuração de modelo padrão agora também lembra e reaplica o seu nível de raciocínio preferido (Padrão / Estendido).
- **Interruptor do halo do campo de entrada** *(desativado por padrão)*: Oculta o halo azul de gradiente radial atrás do campo de entrada do Gemini.
- **Fork por upload de Markdown**: Inicie um novo fork enviando um arquivo markdown — o conteúdo é pré-preenchido como contexto no novo prompt.
- **Configurações na barra de ferramentas de pastas**: As configurações do painel flutuante de pastas vão para a sua barra de ferramentas, com um popover de sincronização na nuvem e fallback automático para modo flutuante.
- **Controles para ocultar Notebooks / Recents**: Os botões de canto para ocultar Notebooks e Recents voltaram, mais um novo botão de troca para escolher acima de qual seção o painel de pastas se ancora.

### Correções

- **Seletor de modelo no Gemini 2026**: O bloqueio de modelo padrão reconhece a nova sobreposição do seletor e o menu deixa de piscar abrindo e fechando.
- **Ocultação automática da barra lateral no Gemini 2026**: A ocultação automática encontra o novo botão de recolhimento.
- **Posição do painel de pastas**: O painel de pastas permanece de forma confiável acima de Recents após as re-renderizações do Gemini.
- **Vazamento da barra lateral recolhida**: Nossa lista de gems e a UI de pastas não ultrapassam mais o trilho recolhido.
- **Atalhos de teclado vs IME**: Os atalhos não são acionados durante a composição IME nem em campos editáveis.
- **Segurança de sobrescrita na nuvem**: A sobrescrita na nuvem é bloqueada quando ainda não existe um backup local de pastas.
- **Pré-preenchimento do fork por upload de Markdown**: O upload de um arquivo markdown no fluxo de fork preenche corretamente o prompt de contexto.
