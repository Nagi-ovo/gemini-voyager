# Guia de contribuição de plugins

O sistema de plugins do Voyager dá prioridade a plugins declarativos: `plugin.json` descreve os metadados e operações DOM, enquanto o CSS descreve os estilos. O plugin não executa JavaScript remoto; o motor de plugins integrado do Voyager interpreta o manifest e os estilos.

Isto torna os plugins mais fáceis de rever e manter. Se quiser contribuir com um plugin, comece por este caminho.

## Caminho recomendado

1. Confirme primeiro que a ideia é adequada para plugin: largura de leitura, correções de layout, ajustes de tema, ocultar ou marcar elementos da página e adaptações simples de sites são bons candidatos.
2. Abra primeiro uma Issue no repositório principal do Voyager. Explique o problema, o site alvo e a diferença face aos plugins existentes; aguarde a aprovação explícita de um mantenedor antes de programar ou abrir uma PR.
3. Use `plugin.json` para metadados, sites correspondentes, definições e contribuições.
4. Coloque os estilos em `style.css` no mesmo diretório e referencie-o em `contributes.styles`.
5. Teste localmente e inclua páginas de teste, capturas de ecrã ou uma gravação curta na PR. Os mantenedores decidirão se está pronto para o catalog oficial.

## Âmbito do plugin

O âmbito deve seguir o problema do utilizador, não uma divisão mecânica por plataforma.

Se a mesma funcionalidade tiver experiência e definições quase iguais em várias plataformas, prefira um plugin multiplataforma. Por exemplo, largura de leitura, navegação entre páginas ou layout de blocos de código podem cobrir Claude, ChatGPT e outros sites através de vários `matches`.

Se cada plataforma exigir definições, lógica DOM ou textos muito diferentes, plugins separados serão mais claros. Não force funções sem relação num único plugin só para "cobrir tudo"; um plugin deve resolver um problema claro.

Regra rápida:

- Mesmo objetivo do utilizador, mesmas definições, só mudam os seletores: prefira um plugin.
- Mesmo tema, mas experiência muito diferente por plataforma: pode separar, mantendo nomes e descrições relacionados.
- Objetivos diferentes: não junte.

## Evitar plugins duplicados

Antes de submeter, verifique o marketplace e os plugins oficiais existentes. Se já houver um bom plugin, melhore-o em vez de criar outro semelhante.

Um duplicado só deve ser aceite quando traz uma melhoria clara, por exemplo:

- Cobre uma plataforma importante que o plugin original não suporta.
- Corrige um problema de compatibilidade que o original não consegue resolver.
- Tem melhor desempenho, acessibilidade ou manutenção de forma clara.
- Oferece uma experiência de utilizador diferente e útil, não apenas outro nome ou pequenas alterações de estilo.

Assim o marketplace fica mais limpo e os utilizadores escolhem melhor.

## Exemplo mínimo

```json
{
  "id": "your-name.example-plugin",
  "name": "Example Plugin",
  "version": "1.0.0",
  "description": "A short description of what this plugin improves.",
  "author": "your-name",
  "category": "readability",
  "license": "MIT",
  "engine": ">=1.0.0",
  "tier": "declarative",
  "matches": ["https://claude.ai/*"],
  "contributes": {
    "styles": [{ "file": "style.css" }],
    "domOps": [
      {
        "op": "addClass",
        "target": "body",
        "className": "gv-plugin-example"
      }
    ]
  }
}
```

`style.css` pode ser escrito como CSS normal, mas recomenda-se que todos os estilos fiquem dentro da sua própria classe `gv-plugin-*`:

```css
.gv-plugin-example .some-target {
  max-width: 880px;
}
```

## Notas do manifest

- Use um prefixo de autor ou estilo de domínio inverso para `id`, como `your-name.reading-width`, para evitar conflitos.
- Mantenha `matches` restrito aos sites onde o plugin realmente precisa de funcionar.
- Um plugin pode incluir vários `matches` se essas plataformas partilharem um objetivo funcional claro.
- Valores recomendados para `category`: `render-fix`, `theme`, `layout`, `readability`, `productivity`, `integration` ou `other`.
- Indique em `engine` a versão do motor de plugins necessária. Os plugins oficiais podem servir de exemplo.
- Adicione `i18n` para chinês, inglês e outras línguas comuns quando possível.

## Limites de CSS e recursos

Plugins declarativos são validados como entrada não confiável, por isso mantenha os recursos autocontidos:

- Não use `@import`.
- Não referencie imagens remotas, fontes externas ou CSS remoto.
- Pode usar CSS normal, propriedades personalizadas e substituições de valores de definições fornecidas pelo Voyager.
- Use o prefixo `gv-plugin-` nas classes para evitar poluir o site anfitrião ou o próprio Voyager.

Se o plugin precisar de definições, comece preferencialmente por valores numéricos. Por exemplo, um plugin de largura de leitura pode escrever o valor numa variável CSS e consumi-la no CSS.

## Limites das operações DOM

Plugins declarativos suportam atualmente:

- `addClass`: adiciona uma classe aos elementos alvo.
- `setAttribute`: define um atributo.
- `setStyle`: define estilos inline ou variáveis CSS.
- `hide`: oculta elementos alvo.

O alvo pode ser um seletor CSS ou um seletor semântico fornecido pelos adaptadores de site do Voyager. Seletores semânticos costumam ser mais estáveis, mas exigem que o adaptador do site já exponha esse alvo.

As operações declarativas devem ser reversíveis e seguras para executar repetidamente. Não dependa de um estado único da página nem assuma que o DOM nunca muda.

## Quando não usar um plugin normal

Se a funcionalidade precisar de executar JavaScript, intercetar pedidos, ler ou escrever dados internos do Voyager, ou depender de lógica complexa em tempo de execução, não é adequada para um plugin declarativo normal.

Abra primeiro uma Issue e explique a necessidade. Se exigir mesmo uma capacidade integrada, podemos considerar implementá-la no repositório do Voyager como plugin builtin/native, como o Formula Copy.

## Antes de abrir uma PR

- O plugin está desativado por padrão e o utilizador ativa-o manualmente.
- Verificou que não existe um plugin quase igual; se existir, melhorou o plugin existente primeiro.
- Testou o site alvo em tema claro e escuro.
- `matches` não cobre sites sem relação.
- Não há referências a recursos remotos.
- O diretório do plugin contém `plugin.json`, os ficheiros CSS necessários e um README curto.
- A PR descreve páginas de teste, capturas ou gravações, e as áreas de página afetadas.
- Concluiu as verificações obrigatórias de carregamento, ativação/desativação, recarregamento e navegação SPA da [matriz de testes de navegadores](https://github.com/Nagi-ovo/voyager/blob/main/.github/BROWSER_TESTING.md), com versões e provas.

Mantenha simples, focado e reversível. Um plugin que resolve um problema claro é muito mais fácil de fundir e manter.
