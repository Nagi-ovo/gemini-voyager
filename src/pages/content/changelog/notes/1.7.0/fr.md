> _« Avec suffisamment d'yeux, tous les bugs sautent aux yeux. » — Eric S. Raymond, 《La Cathédrale et le Bazar》_

### Nouveautés

- **Insérez vos prompts avec `/`**: tapez `/` dans la zone de saisie de Gemini pour chercher vos prompts enregistrés par leur nom, en prévisualiser un et l'insérer au clavier. La fonction a désormais son propre interrupteur et continue donc de marcher même si vous masquez la bulle du gestionnaire de prompts.
- **Nommez les intervenants dans vos exports**: remplacez les libellés Utilisateur et IA par vos propres noms. Le changement s'applique aux exports Markdown, PDF et image, et il est mémorisé.
- **Vos prompts comme titres Markdown** _(désactivé par défaut)_: chaque tour porte le titre de la question que vous avez réellement posée plutôt qu'un numéro de tour générique.
- **Diagnostic anonymisé en un clic**: le popup peut générer un rapport de diagnostic sans conversations, comptes ni liens — copiez-le en Markdown ou téléchargez-le en JSON pour signaler un problème.
- **La largeur de lecture couvre les artefacts Claude**: Claude · Largeur de lecture confortable s'applique aussi aux panneaux d'artefacts de documents de Claude. Si vous l'aviez déjà activée, touchez une fois « Accorder l'accès au site requis » dans le gestionnaire de plugins.
- **Le popup retient où vous en étiez**: en le rouvrant, vous revenez au même endroit dans la liste des réglages au lieu de remonter en haut.
- **Un vrai programme d'installation Safari**: le téléchargement macOS ouvre désormais une fenêtre d'installation conçue pour — glissez Voyager dans Applications, le guide de mise à niveau est juste à côté.

### Corrections

- **Les signets et étoiles restent sur le bon message**: la timeline suit maintenant les identifiants de message de Gemini, donc recharger une longue conversation ne décale plus les étoiles, horodatages, forks ni surbrillances — et retirer une étoile ne supprime plus le mauvais signet.
- **Dossier de sauvegarde Drive renommé en Voyager Data**: un dossier existant est renommé sur place — rien n'est déplacé, copié ni supprimé. Voyager le retrouve désormais via un marqueur invisible, vous pouvez donc le renommer ou le déplacer n'importe où dans Drive sans casser la synchronisation.
- **Les prompts homonymes survivent à l'import et à la synchro**: les prompts portant le même nom ne sont plus supprimés ni écrasés lors d'un import ou d'une synchronisation Drive, et les doublons sont signalés pour que vous puissiez les renommer.
- **Plus de prompts vides via le raccourci d'envoi**: avec « Cmd/Ctrl+Entrée pour envoyer » activé, appuyer sur le raccourci pendant qu'un fichier est encore en cours d'envoi ne déclenche plus un prompt vide — il attend la fin du téléversement.
- **Mermaid, sur tous les fronts**: les exports PDF et image contiennent désormais le diagramme rendu et non son code source, les diagrammes suivent le thème clair ou sombre de Gemini, ils s'affichent quand l'interface de Gemini est en japonais, coréen, arabe et d'autres langues, et les petites erreurs de syntaxe courantes sont corrigées automatiquement.
- **Suppression de filigrane plus fiable**: les filigranes sur fond sombre et ceux difficiles à détecter sont désormais traités, et changer le réglage prend effet immédiatement dans les onglets Gemini déjà ouverts.
- **Dossiers plus solides**: une barre latérale momentanément absente ne vous laisse plus coincé dans un panneau flottant avec un bouton impossible à fermer, et le panneau de dossiers n'apparaît plus en double.
- **L'indicateur d'utilisation se rafraîchit à nouveau**: un nouveau segment d'utilisation ajouté par Gemini ne fait plus rejeter toute la réponse ; l'indicateur se met à jour depuis n'importe quelle conversation et conserve la portée multi-comptes.
- **Et plus encore**: les exports de rapport Deep Research sont de retour dans le menu, l'isolation des comptes sous Firefox ne bloque plus, les prompts slash suivent votre couleur d'accent, le panneau de synchronisation cloud affiche une carte de plateforme plus claire, et le plugin de barre d'utilisation Claude a été retiré.
