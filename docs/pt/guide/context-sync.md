# Sincronização de Contexto: Transferindo Memórias (Experimental)

**Diferentes Dimensões, Compartilhamento Contínuo**

Itere a lógica na web e implemente o código no IDE. O Gemini Voyager quebra as barreiras dimensionais, dando ao seu IDE o "processo de pensamento" da web instantaneamente.

## Diga Adeus à Troca Constante

A maior dor para os desenvolvedores: depois de discutir uma solução minuciosamente na web, você retorna ao VS Code/Trae/Cursor apenas para ter que reexplicar os requisitos como um estranho. Devido às cotas e velocidades de resposta, a web é o "cérebro" e o IDE são as "mãos". O Voyager permite que eles compartilhem a mesma alma.

## Três Passos Simples para Sincronizar

1. **Acorde o CoBridge**: Instale a extensão **CoBridge** do VS Code Marketplace e inicie-a. É a ponte que conecta a web e sua máquina local.
   ![Extensão CoBridge](/assets/CoBridge-extension.png)

   ![Servidor CoBridge Ligado](/assets/CoBridge-on.png)

2. **Conexão de Handshake**:
   - Ative "Context Sync" nas configurações do Voyager.
   - Alinhe os números das portas. Quando você vir "IDE Online", eles estão conectados.

   ![Console de Sincronização de Contexto](/assets/context-sync-console.png)

3. **Sincronização em Um Clique**: Clique em **"Sync to IDE"**.

   ![Sincronização Concluída](/assets/sync-done.png)

## Enraizando no IDE

Após a sincronização, um arquivo `.vscode/AI_CONTEXT_SYNC.md` aparecerá no diretório raiz do seu IDE. Seja Trae, Cursor ou Copilot, eles lerão automaticamente essa "memória" através de seus respectivos arquivos de regra. **Os modelos de IA não sofrerão mais de perda de memória, começando com tudo.**

## Princípios

- **Poluição Zero**: O CoBridge lida automaticamente com o `.gitignore`, garantindo que suas conversas privadas nunca sejam enviadas para repositórios Git.
- **Expertise da Indústria**: Formato Markdown completo, tornando a leitura tão suave para a IA no seu IDE quanto um manual de instruções.
- **Dica Profissional**: Se a conversa for de algum tempo atrás, role para cima usando a [Timeline] primeiro para permitir que a web "lembre" do contexto para melhores resultados de sincronização.
