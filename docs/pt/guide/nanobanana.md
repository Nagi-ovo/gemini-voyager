# Image Refinement (remoção de marca d'água)

::: tip Suporte ao Safari
Desde a v1.6.0, o **Image Refinement** funciona diretamente no Safari, incluindo downloads de imagens em tamanho real sem marca d'água. Chrome, Edge, Firefox e Safari agora compartilham o mesmo fluxo integrado.
:::

**Imagens de IA, mantidas puras.**

As imagens geradas pelo Gemini™ vêm com uma marca d'água visível por padrão. Embora isso sirva para segurança, há cenários criativos em que você precisa de uma base perfeitamente limpa.

## Reconstrução sem perdas

O Image Refinement usa um algoritmo de **Reverse Alpha Blending** (mistura alfa reversa).

- **Não é inpainting com IA**: A remoção tradicional de marca d'água costuma usar IA para "borrar" a área, o que destrói os detalhes dos pixels.
- **Pixels preservados**: Usamos cálculos matemáticos para remover com precisão a camada transparente da marca d'água, restaurando 100% dos pixels originais.
- **Nenhuma perda de qualidade**: A imagem processada continua idêntica à original em todas as áreas sem marca d'água.

## Como usar

Abra o popup do Voyager e ative as linhas que quiser em **Exportação e imagens**. As duas ficam desligadas por padrão:

- **Remover marca d'água ao baixar** (recomendado): Quando você clica no botão de download do Gemini, o arquivo salvo fica sem a marca d'água. Um pequeno selo 🍌 no botão de download indica que a função está ativa; o botão em si continua sendo o do Gemini.
- **Remover marca d'água na pré-visualização** (marcado como **Experimental**): Também limpa as imagens exibidas na tela. É mais lento, e uma imagem pode piscar brevemente enquanto é processada.

Ao desativar a remoção no download, os próximos downloads deixam de ser modificados. Um download que já está sendo processado termina com a configuração inicial, sem salvar uma segunda cópia por causa da mudança. Ao desativar a remoção na pré-visualização, as imagens originais são restauradas somente onde a versão processada pelo Voyager ainda está sendo exibida. Imagens alteradas depois pelo Gemini são preservadas.

## Opção integrada do Gemini

O Gemini está liberando a própria chave de marca d'água visível: **Configurações → Media watermark → Off**. Se a sua conta tiver essa opção, use-a e desative a remoção de marca d'água do Voyager; a opção do Gemini é mais confiável. O Voyager mostra um aviso único sobre isso e informa quando suas imagens recentes já vêm sem marca d'água. Se você ainda não encontrar a chave, continue usando o Voyager. Os metadados SynthID e C2PA permanecem de qualquer forma.

<div style="text-align: center; margin-top: 30px;">
  <img src="/assets/nanobanana.png" alt="Demonstração do Image Refinement" style="border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); max-width: 100%;"/>
</div>

## Agradecimento

Este recurso é baseado no projeto [gemini-watermark-remover](https://github.com/journey-ad/gemini-watermark-remover), de [journey-ad (Jad)](https://github.com/journey-ad), que é um port em JavaScript da [implementação original em C++](https://github.com/allenk/GeminiWatermarkTool), de [allenk](https://github.com/allenk). Somos gratos pelas contribuições deles à comunidade. 🧡
Os avisos MIT mantidos estão disponíveis em [THIRD_PARTY_NOTICES.md](https://github.com/voyager-crew/voyager/blob/main/THIRD_PARTY_NOTICES.md).

## Privacidade e segurança

Todo o processamento acontece **localmente no seu navegador**. Suas imagens nunca são enviadas a servidores de terceiros, garantindo a sua privacidade e a segurança das suas criações.
