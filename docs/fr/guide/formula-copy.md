# Copie de Formules

Voyager facilite grandement la réutilisation de formules mathématiques et de symboles scientifiques. Cliquez sur une formule pour la copier en LaTeX, en MathML prêt pour Word, ou dans un bloc compatible avec Notion.

## Présentation

Lorsque vous demandez à Gemini de dériver des formules ou d'écrire des expressions mathématiques, il les affiche généralement en utilisant LaTeX. Bien que le rendu soit esthétique, l'extraction du code source pour l'utiliser dans vos propres articles, documents ou éditeurs nécessite souvent un effort manuel.

Voyager offre un support transparent pour cela :

1. **Détection Automatique** : Voyager identifie automatiquement les formules affichées sur la page. Lorsque vous survolez une formule, elle indique qu'elle est cliquable.
2. **Copie au Clic** : Cliquez sur une formule en ligne ou en bloc, et elle est copiée aussitôt, avec une brève confirmation.
3. **Choix du Format** : Dans la popup, choisissez à l'avance un **Format de copie de formule** :
   - **LaTeX** : Copie le code source LaTeX standard avec délimiteurs en dollars, idéal pour Overleaf, les éditeurs Markdown, etc.
   - **LaTeX (Sans dollars)** : Copie le code source LaTeX brut, pour les éditeurs qui ajoutent leurs propres délimiteurs.
   - **MathML (Word)** : Le meilleur format pour coller directement dans **Microsoft Word**.
   - **Notion ($$ Format)** : Entoure chaque formule de `$$`, que Notion transforme en équation.

![Copie de Formules](/assets/gemini-math-copy.png)

## Caractéristiques

- **Compatibilité Word** : Grâce au support MathML, vous pouvez coller des formules complexes générées par l'IA directement dans des documents Word tout en conservant un format éditable parfait.
- **Préservation du Contexte** : Ne copie pas seulement la formule, mais préserve également son contexte mathématique.
- **Réponse Instantanée** : Traitement entièrement local pour des résultats immédiats.

## Conseils d'utilisation

- **Rédaction Académique** : Lors de la rédaction d'articles dans Word, demandez à Gemini de dériver des formules, puis utilisez le copier-coller MathML pour éviter la saisie manuelle dans l'éditeur d'équations de Word.
- **Prise de Notes** : Lorsque vous prenez des notes dans Obsidian ou Notion, copiez simplement la source LaTeX directement.

## Où cela fonctionne

Sur Gemini et AI Studio, activez-la avec **Activer la copie des formules** dans la popup ; cet interrupteur et le format de copie s'appliquent aux deux sites. Claude et ChatGPT bénéficient de la copie de formules grâce à une extension intégrée, et DeepSeek dispose d'une extension de copie de formules dans le [catalogue d'extensions](/fr/guide/plugins).
