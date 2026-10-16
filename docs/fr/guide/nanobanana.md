# Image Refinement (suppression du filigrane)

::: tip Prise en charge de Safari
Depuis la v1.6.0, **Image Refinement** fonctionne directement dans Safari, y compris pour télécharger les images sans filigrane en pleine résolution. Chrome, Edge, Firefox et Safari utilisent désormais le même flux intégré.
:::

**Images IA, gardées pures.**

Les images générées par Gemini™ comportent un filigrane visible par défaut. Bien que ce soit pour des raisons de sécurité, il existe des scénarios créatifs où vous avez besoin d'une image parfaitement vierge.

## Reconstruction Sans Perte

Image Refinement utilise un algorithme de **Mélange Alpha Inversé**.

- **Pas d'Inpainting IA** : La suppression de filigrane traditionnelle utilise souvent l'IA pour "barbouiller" la zone, ce qui détruit les détails des pixels.
- **Perfection au Pixel** : Nous utilisons des calculs mathématiques pour retirer précisément la couche de filigrane transparente, restaurant 100% des pixels originaux.
- **Zéro Perte de Qualité** : L'image traitée reste identique à l'originale dans toutes les zones sans filigrane.

## Comment Utiliser

Ouvrez la popup de Voyager et activez les lignes de votre choix sous **Plugins**. Les deux sont désactivées par défaut :

- **Retirer le filigrane au téléchargement** (recommandé) : lorsque vous cliquez sur le bouton de téléchargement de Gemini, le fichier enregistré n'a plus de filigrane. Un petit badge 🍌 sur le bouton indique que la fonction est active ; le bouton reste celui de Gemini.
- **Retirer le filigrane dans l'aperçu** (marqué **Expérimental**) : nettoie aussi les images affichées à l'écran. C'est plus lent, et une image peut scintiller brièvement pendant son traitement.

Si vous désactivez la suppression au téléchargement, les téléchargements suivants ne sont plus modifiés. Un téléchargement déjà en cours de traitement se termine avec le réglage de départ, sans enregistrer une seconde copie à cause du changement. Désactiver la suppression dans l’aperçu rétablit les originaux uniquement là où l’image traitée par Voyager est encore affichée. Les images modifiées entre-temps par Gemini sont conservées.

## L'option intégrée de Gemini

Gemini déploie son propre interrupteur pour le filigrane visible : **Paramètres → Media watermark → Off**. Si votre compte le propose, utilisez-le et désactivez la suppression de filigrane de Voyager : l'option de Gemini est plus fiable. Voyager affiche une seule fois une notification à ce sujet, et vous indique lorsque vos images récentes sont déjà livrées sans filigrane. Si vous ne trouvez pas encore cet interrupteur, continuez à utiliser Voyager. Les métadonnées SynthID et C2PA restent présentes dans tous les cas.

<div style="text-align: center; margin-top: 30px;">
  <img src="/assets/nanobanana.png" alt="Démo Image Refinement" style="border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); max-width: 100%;"/>
</div>

## Remerciements

Cette fonctionnalité est basée sur le projet [gemini-watermark-remover](https://github.com/journey-ad/gemini-watermark-remover) de [journey-ad (Jad)](https://github.com/journey-ad), qui est un portage JavaScript de [l'implémentation C++ originale](https://github.com/allenk/GeminiWatermarkTool) de [allenk](https://github.com/allenk). Nous sommes reconnaissants pour leurs contributions à la communauté. 🧡
Les mentions MIT tierces conservées sont disponibles dans [THIRD_PARTY_NOTICES.md](https://github.com/voyager-crew/voyager/blob/main/THIRD_PARTY_NOTICES.md).

## Confidentialité & Sécurité

Tout le traitement se fait **localement dans votre navigateur**. Vos images ne sont jamais téléchargées sur des serveurs tiers, garantissant votre confidentialité et sécurité créative.
