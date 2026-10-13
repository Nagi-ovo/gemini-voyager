# Image Refinement (suppression du filigrane)

::: tip Prise en charge de Safari
Depuis la v1.6.0, **Image Refinement** fonctionne directement dans Safari, y compris pour les téléchargements en pleine taille sans filigrane. Chrome, Edge, Firefox et Safari partagent désormais le même flux intégré.
:::

**Images IA, gardées pures.**

Les images générées par Gemini™ comportent un filigrane visible par défaut. Ce choix relève de la sécurité, mais il existe des usages créatifs où il faut une image parfaitement propre.

## Reconstruction sans perte

Image Refinement utilise un algorithme de **mélange alpha inversé** (Reverse Alpha Blending).

- **Pas d'inpainting par IA** : la suppression de filigrane classique utilise souvent l'IA pour « lisser » la zone, ce qui détruit les détails des pixels.
- **Pixels exacts** : nous appliquons des calculs mathématiques pour retirer précisément la couche transparente du filigrane et restaurer 100 % des pixels d'origine.
- **Aucune perte de qualité** : l'image traitée reste identique à l'original dans toutes les zones sans filigrane.

## Mode d'emploi

Ouvrez la fenêtre de Voyager et repérez **Options Image Refinement**. Les deux interrupteurs sont désactivés tant que vous ne les activez pas :

- **Retirer le filigrane au téléchargement** (recommandé) : lorsque vous cliquez sur le bouton de téléchargement de Gemini, le fichier enregistré n'a plus de filigrane. Un petit badge 🍌 sur le bouton indique que la fonction est active ; le bouton reste celui de Gemini.
- **Retirer le filigrane dans l'aperçu** (instable) : nettoie aussi les images affichées à l'écran. C'est plus lent, et une image peut scintiller brièvement pendant son traitement.

## L'option intégrée de Gemini

Gemini déploie son propre interrupteur pour le filigrane visible : **Paramètres → Media watermark → Off**. Si votre compte le propose, utilisez-le et désactivez la suppression de filigrane de Voyager : l'option de Gemini est plus fiable. Voyager affiche une seule fois une notification à ce sujet, et vous indique lorsque vos images récentes sont déjà livrées sans filigrane. Si vous ne trouvez pas encore cet interrupteur, continuez à utiliser Voyager. Les métadonnées SynthID et C2PA restent présentes dans tous les cas.

<div style="text-align: center; margin-top: 30px;">
  <img src="/assets/nanobanana.png" alt="Démo Image Refinement" style="border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); max-width: 100%;"/>
</div>

## Remerciements

Cette fonctionnalité repose sur le projet [gemini-watermark-remover](https://github.com/journey-ad/gemini-watermark-remover) de [journey-ad (Jad)](https://github.com/journey-ad), qui est un portage JavaScript de l'[implémentation C++ originale](https://github.com/allenk/GeminiWatermarkTool) d'[allenk](https://github.com/allenk). Nous remercions leurs auteurs pour leur contribution à la communauté. 🧡
Les mentions MIT tierces conservées sont disponibles dans [THIRD_PARTY_NOTICES.md](https://github.com/voyager-crew/voyager/blob/main/THIRD_PARTY_NOTICES.md).

## Confidentialité et sécurité

Tout le traitement se fait **localement, dans votre navigateur**. Vos images ne sont jamais envoyées à des serveurs tiers, ce qui protège votre vie privée et la sécurité de vos créations.
