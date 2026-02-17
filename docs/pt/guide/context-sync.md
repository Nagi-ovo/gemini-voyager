# Transporte de memória: Sincronização de Contexto (Experimental)

**Diferentes Dimensões, Compartilhamento Contínuo**

Itere a lógica na web e implemente o código no IDE. O Gemini Voyager quebra as barreiras dimensionales, dando ao seu IDE o "processo de pensamento" da web instantaneamente.

## Chega de pular entre abas

A maior dor para os desenvolvedores: depois de discutir uma solução minuciosamente na web, você retorna ao VS Code/Trae/Cursor apenas para ter que reexplicar os requisitos como um estranho. Devido às cotas e velocidades de resposta, a web é o "cérebro" e o IDE são as "mãos". O Voyager permite que eles compartilhem a mesma alma.

## Três Passos Simples para Sincronizar

1. **Instale e ative o CoBridge**:
   Instale a extensão **CoBridge** no VS Code. Ela serve como a ponte central conectando a interface web ao seu IDE local.
   - **[Instalar via VS Code Marketplace](https://open-vsx.org/extension/windfall/co-bridge)**

   ![Extensão CoBridge](/assets/CoBridge-extension.png)

   Após a instalação, clique no ícone à direita e inicie o servidor.
   ![Servidor CoBridge Ligado](/assets/CoBridge-on.png)

2. **Aperto de mão**:
   - Ative a "Sincronização de Contexto" nas configurações do Voyager.
   - Alinhe o número da porta. Quando vir "IDE Online", significa que eles estão conectados.

   ![Painel de Sincronização de Contexto](/assets/context-sync-console.png)

3. **Sincronização em um clique**: Clique em **"Sync to IDE"**. Sejam **tabelas de dados** complexas ou **imagens de referência** intuitivas, tudo pode ser sincronizado instantaneamente com o seu IDE.

   ![Sincronização Concluída](/assets/sync-done.png)

## Criando Raízes

Assim que a sincronização for concluída, um arquivo `.cobridge/AI_CONTEXT.md` aparecerá no diretório raiz do seu IDE. Seja Trae, Cursor ou Copilot, eles lerão automaticamente essa 'memória' por meio de seus respectivos arquivos Rule.

```
your-project/
├── .cobridge/
│   ├── images/
│   │   ├── context_img_1_1.png
│   │   └── context_img_1_2.png
│   └── AI_CONTEXT.md
├── .github/
│   └── copilot-instructions.md
├── .gitignore
├── .traerules
└── .cursorrules
```

## Seus Princípios

- **Zero Poluição**: O CoBridge gerencia automaticamente o `.gitignore`, garantindo que suas conversas privadas não sejam enviadas para repositórios Git.
- **Especialista**: Formato Markdown completo, fazendo com que a IA no IDE leia de forma tão fluida quanto um manual de instruções.
- **Dica**: Se a conversa for antiga, use a [Linha do Tempo] para rolar para cima e fazer com que a web "lembre" do contexto antes de sincronizar para melhores resultados.

---

## Parta Agora

**O pensamento já está pronto na nuvem, agora, deixe-o criar raízes localmente.**

- **[Instalar o Plugin CoBridge](https://open-vsx.org/extension/windfall/co-bridge)**: Encontre seu portal dimensional e ative a "respiração sincronizada" com um clique.
- **[Visitar o Repositório GitHub](https://github.com/Winddfall/CoBridge)**: Saiba mais sobre a lógica por trás do CoBridge ou dê uma Star para este projeto de "sincronização de almas".

> **Grandes modelos não perdem mais a memória; prontos para ação imediata.**
