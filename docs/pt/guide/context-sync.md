# Transporte de memória: Sincronização de Contexto (Experimental)

**Dimensões diferentes, compartilhamento sem emendas**

Itere a lógica na web e implemente o código na IDE. O Voyager derruba as barreiras entre essas dimensões e dá à sua IDE, instantaneamente, o "processo de pensamento" da web.

## Chega de ficar trocando de aba

A maior dor de quem programa: depois de discutir uma solução a fundo na web, você volta para o VS Code, o Trae ou o Cursor e precisa explicar os requisitos de novo, como se fosse um estranho. Por causa das cotas e da velocidade de resposta, a web é o "cérebro" e a IDE são as "mãos". O Voyager faz os dois compartilharem a mesma alma.

## Três passos simples para sincronizar

1. **Instale e ative o CoBridge**:
   Instale a extensão **CoBridge** no VS Code ou em um editor compatível. Ela é a ponte principal que conecta a interface web à sua IDE local.
   - **[Instalar pelo Open VSX](https://open-vsx.org/extension/windfall/co-bridge)**

   ![Extensão CoBridge](/assets/CoBridge-extension.png)

   Depois de instalar, **abra qualquer diretório de trabalho**, clique no ícone à direita e inicie o servidor.
   ![Servidor CoBridge ligado](/assets/CoBridge-on.png)

2. **Aperto de mão**:
   - Na seção **Sincronização de Contexto** do popup do Voyager, defina **Modo Sincr.** como **Manual**.
   - Deixe a **Porta do servidor** igual à porta que o CoBridge está usando. Quando aparecer "IDE Online", as duas partes estão conectadas.

   ![Console de Sincronização de Contexto](/assets/context-sync-console.png)

3. **Sincronização com um clique**: Clique em **"Sincronizar com IDE"**. Sejam **tabelas de dados** complexas ou **imagens de referência** intuitivas, tudo pode ser sincronizado instantaneamente com a sua IDE.

   ![Sincronização concluída](/assets/sync-done.png)

## Criando raízes na IDE

Depois da sincronização, um arquivo `.cobridge/AI_CONTEXT.md` aparece no diretório de trabalho da sua IDE. Seja no Trae, no Cursor ou no Copilot, essas ferramentas leem automaticamente essa "memória" pelos respectivos arquivos de regras.

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

## Princípios

- **Zero poluição**: O CoBridge cuida do `.gitignore` automaticamente, garantindo que suas conversas privadas nunca sejam enviadas para repositórios Git.
- **Padrão de mercado**: Formato Markdown completo, o que faz a IA da sua IDE ler tudo tão bem quanto um manual de instruções.
- **Dica de especialista**: Se a conversa for antiga, use a [Linha do Tempo](/pt/guide/timeline) para rolar para cima antes de sincronizar. Assim a web "lembra" do contexto e o resultado sai melhor.

---

## Pronto para decolar

**A lógica já está pronta na nuvem; agora deixe-a criar raízes localmente.**

- **[Instalar a extensão CoBridge](https://open-vsx.org/extension/windfall/co-bridge)**: encontre seu portal dimensional e ative a "respiração sincronizada" com um clique.
- **[Acessar o repositório no GitHub](https://github.com/Winddfall/CoBridge)**: mergulhe na lógica por trás do CoBridge ou dê uma estrela a este projeto de "sincronização de almas".

> **Os LLMs nunca mais vão perder a memória; prontos para uso imediato.**
