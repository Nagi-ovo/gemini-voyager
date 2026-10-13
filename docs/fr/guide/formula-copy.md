# Copie de formules

Voyager facilite la réutilisation des formules mathématiques et des symboles scientifiques. Cliquez sur une formule pour la copier en LaTeX, en MathML prêt pour Word, ou dans un bloc compatible avec Notion.

## Présentation

Lorsque vous demandez à Gemini de dériver des formules ou d'écrire des expressions mathématiques, il les affiche généralement avec LaTeX. C'est élégant, mais extraire le code source pour l'utiliser dans vos propres articles, documents ou éditeurs demande souvent un effort manuel.

Voyager prend en charge cela en toute simplicité :

1. **Détection automatique** : Voyager repère les formules affichées sur la page. Lorsque vous survolez une formule, elle indique qu'elle est cliquable.
2. **Copie au clic** : cliquez sur une formule en ligne ou en bloc, et elle est copiée aussitôt, avec une brève confirmation.
3. **Choix du format** : dans la fenêtre de l'extension, choisissez à l'avance un **Format de copie de formule** :
   - **LaTeX** : source LaTeX standard, avec délimiteurs en dollars, idéal pour Overleaf, les éditeurs Markdown, etc.
   - **LaTeX (Sans dollars)** : source LaTeX brute, pour les éditeurs qui ajoutent leurs propres délimiteurs.
   - **MathML (Word)** : le meilleur format pour coller directement dans **Microsoft Word**.
   - **Notion ($$ Format)** : entoure chaque formule de `$$`, que Notion transforme en équation.

![Copie de formules](/assets/gemini-math-copy.png)

## Fonctionnalités

- **Compatibilité Word** : grâce au MathML, vous pouvez coller des formules complexes générées par l'IA directement dans un document Word, en conservant un format modifiable parfait.
- **Préservation du contexte** : la copie ne contient pas seulement la formule, mais aussi son contexte mathématique.
- **Réponse instantanée** : le traitement se fait entièrement en local, pour un résultat immédiat.

## Conseils d'utilisation

- **Rédaction académique** : lorsque vous rédigez un article dans Word, demandez à Gemini de dériver les formules, puis utilisez le copier-coller MathML pour éviter de les ressaisir dans l'éditeur d'équations de Word.
- **Prise de notes** : lorsque vous prenez des notes dans Obsidian ou Notion, copiez directement la source LaTeX.

## Où cela fonctionne

Sur Gemini et AI Studio, activez-la avec **Activer la copie des formules** dans la fenêtre de l'extension ; cet interrupteur et le format de copie s'appliquent aux deux sites. Claude et ChatGPT bénéficient de la copie de formules grâce à une extension intégrée, et DeepSeek dispose d'une extension de copie de formules dans le [catalogue d'extensions](/fr/plugins).
