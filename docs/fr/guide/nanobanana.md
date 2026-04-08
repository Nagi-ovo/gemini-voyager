# Option NanoBanana

::: warning Compatibilité du navigateur
Actuellement, la fonction **NanoBanana** n'est **pas prise en charge sur Safari** en raison des limitations de l'API du navigateur. Nous vous recommandons d'utiliser **Chrome** ou **Firefox** si vous avez besoin d'utiliser cette fonction.

Les utilisateurs de Safari peuvent télécharger manuellement leurs images sur des sites d'outils comme [banana.ovo.re](https://banana.ovo.re/) pour le traitement (bien que le succès ne soit pas garanti pour toutes les images en raison des différentes résolutions).
:::

**Images IA, gardées pures.**

Les images générées par Gemini™ comportent un filigrane visible par défaut. Bien que ce soit pour des raisons de sécurité, il existe des scénarios créatifs où vous avez besoin d'une image parfaitement vierge.

## Reconstruction Sans Perte

NanoBanana utilise un algorithme de **Mélange Alpha Inversé**.

- **Pas d'Inpainting IA** : La suppression de filigrane traditionnelle utilise souvent l'IA pour "barbouiller" la zone, ce qui détruit les détails des pixels.
- **Perfection au Pixel** : Nous utilisons des calculs mathématiques pour retirer précisément la couche de filigrane transparente, restaurant 100% des pixels originaux.
- **Zéro Perte de Qualité** : L'image traitée reste identique à l'originale dans toutes les zones sans filigrane.

## Comment Utiliser

1. **Activez-le** : Trouvez "Option NanoBanana" à la fin du panneau de paramètres de Voyager et activez-le.
2. **Auto-traitement** : Chaque image que vous générez sera maintenant traitée automatiquement en arrière-plan.
3. **Télécharger directement** :
   - Survolez une image traitée et vous verrez un bouton 🍌.
   - **Le bouton 🍌 remplace complètement** le bouton de téléchargement natif pour garantir que vous obtenez toujours directement l'image 100% sans filigrane.

<div style="text-align: center; margin-top: 30px;">
  <img src="/assets/nanobanana.png" alt="Démo NanoBanana" style="border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); max-width: 100%;"/>
</div>

## Remerciements

Cette fonctionnalité est basée sur le projet [gemini-watermark-remover](https://github.com/journey-ad/gemini-watermark-remover) de [journey-ad (Jad)](https://github.com/journey-ad), qui est un portage JavaScript de [l'implémentation C++ originale](https://github.com/allenk/GeminiWatermarkTool) de [allenk](https://github.com/allenk). Nous sommes reconnaissants pour leurs contributions à la communauté. 🧡
Les mentions MIT tierces conservées sont disponibles dans [THIRD_PARTY_NOTICES.md](https://github.com/Nagi-ovo/gemini-voyager/blob/main/THIRD_PARTY_NOTICES.md).

## Confidentialité & Sécurité

Tout le traitement se fait **localement dans votre navigateur**. Vos images ne sont jamais téléchargées sur des serveurs tiers, garantissant votre confidentialité et sécurité créative.
