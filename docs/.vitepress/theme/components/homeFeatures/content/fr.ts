import type { HomeFeaturesContent } from '../types';

export const fr: HomeFeaturesContent = {
  timeline: {
    eyebrow: 'Chronologie',
    title: 'Ne scrollez plus. Volez.',
    body: 'Chaque point à droite est une question que vous avez posée. Survolez-le pour la voir, cliquez pour y sauter. Attardez-vous sur le rail et un bouton liste apparaît : il ouvre une vue d’ensemble de toute la conversation, dans laquelle vous pouvez chercher.',
    hint: 'Essayez : cliquez sur un point · appui long pour mettre une étoile · survolez le rail pour la vue d’ensemble',
    overview: 'Ouvrir la vue d’ensemble',
    searchPlaceholder: 'Rechercher dans cette conversation',
    noMatch: 'Aucune question ne correspond à « {q} »',
  },
  folders: {
    eyebrow: 'Dossiers',
    title: 'Les dossiers, comme ils devraient l’être.',
    body: 'Directement dans la barre latérale de Gemini et de ChatGPT. Trois niveaux, les favoris en haut, et une recherche.',
    hint: 'Essayez : ouvrez une autre conversation · glissez-en une dans un dossier · cherchez « chat »',
    heading: 'Dossiers',
    searchPlaceholder: 'Rechercher des dossiers et des discussions',
    newFolder: 'Nouveau dossier',
    noMatch: 'Aucun dossier ni discussion ne correspond à « {q} »',
    star: 'Mettre en favori',
  },
  prompts: {
    eyebrow: 'Bibliothèque de prompts',
    title: 'Un bon prompt, ça se garde.',
    body: "Enregistrez un prompt une fois et retrouvez-le dans n'importe quelle interface web d'IA, même en local comme DeepSeek Harness.",
    hint: 'Essayez : choisissez-en un, il arrive dans le champ de saisie à gauche, puis envoyez',
    add: 'Ajouter',
    searchPlaceholder: 'Rechercher des prompts ou tags',
    all: 'Tous',
    saved: 'Enregistrés',
    settings: 'Paramètres',
    noMatch: 'Aucun prompt ne correspond à « {q} »',
  },
  composer: {
    replies: [
      "Ceci est une démo : je ne connais que quelques réponses écrites d'avance. Mais votre message vient d'ajouter un point sur la timeline ; maintenez-le appuyé pour le mettre en favori.",
      'Pour une vraie réponse, demandez à votre IA habituelle. Si vous réutilisez cette phrase, enregistrez-la avec « {add} » dans la bibliothèque : elle sera à un clic la prochaine fois.',
      "Bien reçu. Petite astuce au passage : glissez cette conversation dans un dossier, vous n'aurez plus à fouiller l'historique.",
      'Je suis une réponse de démo toute faite. Installez Voyager et cette timeline et cette bibliothèque de prompts apparaissent dans les Gemini, ChatGPT, Claude et DeepSeek que vous utilisez vraiment, et ces dossiers dans Gemini et ChatGPT.',
    ],
    placeholder: 'Posez une question ou choisissez un prompt',
    send: 'Envoyer',
    ball: 'Ouvrir la bibliothèque de prompts',
  },
  demo: {
    replay: 'Rejouer',
    close: 'Terminer la démo',
    prev: 'Fonction précédente',
    next: 'Fonction suivante',
  },
  replyLeads: {
    table: 'Voici le tableau :',
    summary: 'En trois points :',
    todo: 'À cocher au fur et à mesure :',
    plain: 'En clair :',
  },
  chats: {
    kyoto: {
      title: 'Trois jours à Kyoto',
      star: true,
      starred: [3],
      turns: [
        [
          'Je pars à Kyoto en novembre. Comment organiser trois jours ?',
          'Novembre, c’est la pleine saison des érables rouges. Découpez le séjour par quartier :\n- Jour 1, Higashiyama : Kiyomizu-dera, Ninenzaka, sanctuaire Yasaka\n- Jour 2, Arashiyama : bambouseraie, Tenryu-ji, train panoramique\n- Jour 3, Fushimi Inari, puis le marché Nishiki l’après-midi',
        ],
        [
          'À quelle heure y a-t-il le moins de monde à Kiyomizu-dera ?',
          'Entre l’ouverture à 6 h et 7 h. La lumière du matin sur la terrasse est aussi la plus belle, et les groupes arrivent après 9 h.',
        ],
        [
          'Il faut réserver le train panoramique d’Arashiyama ?',
          'En saison des érables, oui : réservez sur le site officiel un mois à l’avance. Asseyez-vous à droite pour la vue sur les gorges de la Hozu.',
        ],
        [
          'Quel quartier est le plus pratique pour loger ?',
          'Autour de la gare de Kyoto ou de Shijo-Kawaramachi. La gare est sur la route de Fushimi et d’Arashiyama ; Kawaramachi est plus agréable pour dîner et flâner le soir.',
        ],
        [
          'Des adresses de ramen sans file d’attente ?',
          'Évitez le coup de feu de midi et de 18 h, et la plupart des échoppes n’ont pas de queue. Autour de Kawaramachi, les petites adresses du quartier vous servent sans attendre après 21 h.',
        ],
      ],
      extra: {
        table: [
          ['Jour', 'Matin', 'Après-midi'],
          ['1', 'Kiyomizu-dera', 'Ninenzaka, sanctuaire Yasaka'],
          ['2', 'Bambouseraie', 'Tenryu-ji, train panoramique'],
          ['3', 'Fushimi Inari', 'Marché Nishiki'],
        ],
        summary: [
          'Un quartier par jour : Higashiyama, Arashiyama, Fushimi',
          'Kiyomizu-dera à 6 h, train réservé un mois avant',
          'Loger près de la gare ou à Kawaramachi, manger en décalé',
        ],
        translation:
          'Skip the noon and 6 pm rush and most ramen shops have no line. Around Kawaramachi, small neighborhood places will seat you without a wait after 9 pm.',
        todo: [
          'Réserver le train d’Arashiyama (un mois avant)',
          'Réserver un hôtel près de la gare de Kyoto',
          'Vérifier les horaires de Kiyomizu-dera',
          'Acheter une carte ICOCA',
        ],
      },
    },
    packing: {
      title: 'Liste de bagages',
      turns: [
        [
          'Faut-il un gros manteau pour Kyoto en novembre ?',
          'Il fait autour de 8 °C le matin et le soir, 15 °C en journée. Une doudoune légère ou une polaire sur un haut à manches longues suffit.',
        ],
        [
          'Mes chargeurs vont marcher au Japon ?',
          'Le Japon utilise des prises à deux fiches plates (type A) en 100 V. Vos chargeurs de téléphone et d’ordinateur acceptent 100–240 V, mais nos fiches rondes ne rentrent pas : prenez un adaptateur. Laissez le lisseur 230 V à la maison.',
        ],
        [
          'Suica ou ICOCA ?',
          'Les deux marchent dans le Kansai. ICOCA y est plus répandue, et les distributeurs de la gare de Kyoto la vendent.',
        ],
      ],
      extra: {
        table: [
          ['Objet', 'À prendre ?', 'Remarque'],
          ['Doudoune légère', 'Oui', '8 °C le matin'],
          ['Adaptateur de prise', 'Oui', 'Type A, 100 V'],
          ['Carte de transport', 'Sur place', 'ICOCA'],
        ],
        summary: [
          'Une doudoune légère ou une polaire suffit',
          'Prises type A en 100 V : prenez un adaptateur',
          'Achetez une ICOCA à la gare de Kyoto',
        ],
        translation:
          'Both work in Kansai, but ICOCA is more common there. You can buy one from the ticket machines at Kyoto Station.',
        todo: [
          'Doudoune légère',
          'Deux hauts à manches longues',
          'Adaptateur type A et batterie externe',
          'Passeport et réservation d’hôtel',
        ],
      },
    },
    dinner: {
      title: 'Que faire avec les restes du frigo',
      turns: [
        [
          'J’ai des œufs, des tomates et un demi-oignon. Je fais quoi ce soir ?',
          'Une chakchouka express, prête en un quart d’heure : faites fondre l’oignon, ajoutez les tomates en dés jusqu’à obtenir une sauce, puis cassez les œufs dessus et couvrez cinq minutes.',
        ],
        [
          'J’aimerais aussi une soupe',
          'Avec la dernière tomate, faites une soupe express : faites-la revenir, ajoutez de l’eau et un cube de bouillon, portez à ébullition, puis versez un œuf battu en filet en remuant.',
        ],
        [
          'Ça passe sans persil ?',
          'Oui. Un tour de moulin à poivre ou un filet d’huile d’olive juste avant de servir fait tout aussi bien l’affaire.',
        ],
      ],
      extra: {
        table: [
          ['Plat', 'Ingrédients', 'Temps'],
          ['Chakchouka express', '3 œufs, 2 tomates, ½ oignon', '15 min'],
          ['Soupe tomate à l’œuf', '1 tomate, 1 œuf, 1 cube de bouillon', '8 min'],
        ],
        summary: [
          'Plat : chakchouka express',
          'Soupe : tomate à l’œuf',
          'Pas de persil ? Du poivre ou de l’huile d’olive',
        ],
        translation:
          'Yes. A few turns of the pepper mill or a drizzle of olive oil right before serving works just as well.',
        todo: [
          'Faire griller du pain',
          'Faire fondre l’oignon',
          'Cuire les tomates et les œufs',
          'Préparer la soupe',
        ],
      },
    },
    week: {
      title: 'Une semaine de gamelles',
      turns: [
        [
          'Fais-moi un planning de gamelles pour la semaine, rien de compliqué',
          'Le dimanche, cuisinez trois plats d’avance : cuisses de poulet rôties, bœuf mijoté à la tomate et brocolis à l’ail. Congelez-les en portions, puis prenez-en une chaque jour avec du riz cuit du jour.',
        ],
        [
          'On peut rester sous 5 € par jour ?',
          'Oui. Prenez les cuisses de poulet et le bœuf à braiser en grand format, et des brocolis de saison : la portion revient à environ 3,50 €.',
        ],
      ],
      extra: {
        table: [
          ['Jour', 'Plat'],
          ['Lun', 'Poulet rôti'],
          ['Mar', 'Bœuf à la tomate'],
          ['Mer', 'Poulet rôti'],
          ['Jeu', 'Bœuf à la tomate'],
          ['Ven', 'Brocolis à l’ail et poulet'],
        ],
        summary: [
          'Trois plats cuisinés le dimanche, congelés en portions',
          'En semaine, seulement le riz à cuire',
          'Environ 3,50 € la portion',
        ],
        translation:
          'Yes. Buy the chicken legs and stewing beef in large packs and pick seasonal broccoli: each portion comes to about €3.50.',
        todo: [
          '1 kg de cuisses de poulet',
          '700 g de bœuf à braiser',
          '3 têtes de brocoli',
          '10 boîtes repas',
        ],
      },
    },
    landlord: {
      title: 'Signaler la panne du chauffe-eau au propriétaire',
      turns: [
        [
          'Mon chauffe-eau est en panne. Comment le dire à mon propriétaire ?',
          'Dites ce qui se passe et depuis quand, demandez quel jour lui convient pour une réparation, et précisez quand vous êtes chez vous.',
        ],
        [
          'Écris-moi le SMS',
          'Bonjour Monsieur Martin, le chauffe-eau ne s’allume plus depuis hier soir et je n’ai plus d’eau chaude. Pourriez-vous envoyer quelqu’un pour le réparer dans les prochains jours ? Je suis disponible en semaine après 18 h et le week-end. Merci d’avance, bonne journée !',
        ],
      ],
      extra: {
        table: [
          ['Point', 'Quoi dire'],
          ['Problème', 'Ne s’allume plus depuis hier soir'],
          ['Demande', 'Envoyer un réparateur'],
          ['Disponibilités', 'En semaine après 18 h, le week-end'],
        ],
        summary: [
          'Dire ce qui se passe et depuis quand',
          'Demander une réparation',
          'Donner ses disponibilités',
        ],
        translation:
          "Hello Mr Martin, the water heater hasn't come on since last night, so I have no hot water. Could you send someone to repair it in the next few days? I'm available on weekdays after 6 pm and at weekends. Thanks in advance, and have a good day!",
        todo: [
          'Filmer le code d’erreur du chauffe-eau',
          'Envoyer le SMS',
          'Fixer un créneau pour la réparation',
        ],
      },
    },
    run: {
      title: 'Mal au genou en courant',
      turns: [
        [
          'J’ai mal à l’extérieur du genou quand je cours. Je peux continuer ?',
          'Une douleur sur le côté externe du genou vient souvent de la bandelette ilio-tibiale (le « syndrome de l’essuie-glace »). Arrêtez trois à cinq jours, puis reprenez par de courtes sorties lentes. Si vous avez mal en marchant, consultez un médecin du sport.',
        ],
        [
          'Des étirements à faire ?',
          '- Rouleau de massage sur l’extérieur de la cuisse, 2 minutes par côté\n- Étirement debout jambes croisées, 30 secondes par côté\n- Élévations de jambe allongé sur le côté, 15 par côté',
        ],
      ],
      extra: {
        table: [
          ['Exercice', 'Volume'],
          ['Rouleau de massage', '2 min par côté'],
          ['Étirement jambes croisées', '30 s par côté'],
          ['Élévations latérales', '15 par côté'],
        ],
        summary: [
          'Douleur externe : souvent la bandelette ilio-tibiale',
          'Trois à cinq jours sans courir',
          'Rouleau et renforcement des hanches chaque jour',
        ],
        translation:
          '- Foam-roll the outer thigh, 2 minutes per side\n- Standing cross-leg stretch, 30 seconds per side\n- Side-lying leg raises, 15 reps per side',
        todo: [
          'Trois jours sans courir',
          'Rouleau de massage tous les jours',
          'Trois séries d’élévations par jour',
          'Reprendre par 3 km',
        ],
      },
    },
    cat: {
      title: 'Mon chat ne mange presque plus',
      turns: [
        [
          'Mon chat boude ses croquettes depuis deux jours. C’est normal ?',
          'Regardez d’abord s’il est en forme, s’il boit et s’il va à la litière. S’il va bien et fait juste le difficile, essayez une autre saveur. S’il ne mange rien pendant plus de 24 heures, consultez vite un vétérinaire.',
        ],
        [
          'Comment changer de croquettes ?',
          'Sur sept jours : un quart de nouvelles croquettes les deux premiers jours, la moitié les trois suivants, trois quarts les deux derniers.',
        ],
      ],
      extra: {
        table: [
          ['Jours', 'Nouvelles croquettes'],
          ['1–2', '25 %'],
          ['3–5', '50 %'],
          ['6–7', '75 %'],
        ],
        summary: [
          'Vérifier forme, eau et litière',
          'Rien mangé en 24 heures : vétérinaire',
          'Changer de croquettes sur sept jours',
        ],
        translation:
          'Switch over seven days: a quarter new food for the first two days, half for the next three, and three quarters for the last two.',
        todo: [
          'Noter ce qu’il mange aujourd’hui',
          'Acheter un petit sachet d’une autre saveur',
          'Suivre la transition sur sept jours',
        ],
      },
    },
    headphones: {
      title: 'Choisir un casque à réduction de bruit',
      turns: [
        [
          'Comment choisir un casque à réduction de bruit pour le métro ?',
          'Fixez un budget, puis comparez la réduction de bruit, le confort et l’autonomie. Dans un RER bruyant, privilégiez la réduction de bruit ; si vous le portez des heures, le confort compte davantage.',
        ],
        [
          'Et avec des lunettes, ça gêne ?',
          'Oui. Les coussinets d’un casque circum-auriculaire appuient sur les branches et l’isolation en pâtit. Avec des lunettes, des écouteurs intra-auriculaires sont plus simples.',
        ],
      ],
      extra: {
        table: [
          ['Type', 'Réduction de bruit', 'Avec des lunettes'],
          ['Casque', 'Plus forte', 'Appuie sur les branches'],
          ['Intra-auriculaires', 'Suffisante', 'Aucun souci'],
        ],
        summary: [
          'Fixer un budget d’abord',
          'Dans les transports, priorité à la réduction de bruit',
          'Des lunettes ? Prenez des intra',
        ],
        translation:
          'Yes. Over-ear cushions press on the arms of your glasses and break the seal. If you wear glasses, in-ear buds are the easier choice.',
        todo: [
          'Fixer un budget',
          'Essayer deux modèles en magasin',
          'Comparer l’autonomie et la taille du boîtier',
        ],
      },
    },
  },
  tree: [
    {
      folder: 'Voyages',
      open: true,
      kids: [{ folder: 'Kyoto', open: true, kids: [{ chat: 'kyoto' }, { chat: 'packing' }] }],
    },
    { folder: 'Cuisine', kids: [{ chat: 'dinner' }, { chat: 'week' }] },
    { chat: 'landlord' },
    { chat: 'run' },
    { chat: 'cat' },
    { chat: 'headphones' },
  ],
  current: 'kyoto',
  promptList: [
    {
      name: 'Mettre en tableau',
      tag: 'Organiser',
      text: 'Mets ce qui précède sous forme de tableau.',
      reply: 'table',
    },
    {
      name: 'Résumer en trois points',
      tag: 'Organiser',
      text: 'Résume cette conversation en trois points.',
      reply: 'summary',
    },
    {
      name: 'Faire une checklist',
      tag: 'Organiser',
      text: 'Donne-moi une liste à cocher.',
      reply: 'todo',
    },
    {
      name: 'Traduire en anglais',
      tag: 'Traduire',
      text: 'Traduis ta dernière réponse dans un anglais naturel.',
      reply: 'translate',
    },
    {
      name: 'Dis-le simplement',
      tag: 'Apprendre',
      text: 'Redis-le avec des mots simples.',
      reply: 'plain',
    },
  ],
  groups: [
    {
      title: 'Confort visuel',
      items: [
        {
          icon: 'move-horizontal',
          name: 'Largeur du chat',
          detail: 'Élargissez la conversation pour que code et tableaux respirent',
        },
        {
          icon: 'a-large-small',
          name: 'Taille de police',
          detail: 'Réglez la taille du texte du chat à part',
        },
        {
          icon: 'clock-3',
          name: 'Horodatage des messages',
          detail: 'L’heure d’envoi de chaque message',
        },
        {
          icon: 'workflow',
          name: 'Diagrammes Mermaid',
          detail: 'Organigrammes et diagrammes de séquence rendus sur place',
        },
        {
          icon: 'snowflake,rain,sakura',
          name: 'Effets visuels',
          detail: 'Neige, pluie ou fleurs de cerisier',
        },
      ],
    },
    {
      title: 'Vos données',
      items: [
        {
          icon: 'file-down',
          name: 'Export des conversations',
          detail: 'Markdown, PDF, JSON ou image',
        },
        {
          icon: 'microscope',
          name: 'Export Deep Research',
          detail: 'Avec le raisonnement et les liens des sources',
        },
        { icon: 'cloud', name: 'Synchro Cloud', detail: 'Google Drive, ou iCloud sur Safari' },
        {
          icon: 'list-x',
          name: 'Suppression par lot',
          detail: 'Cochez des conversations, supprimez-les d’un coup',
        },
        {
          icon: 'image',
          name: 'Suppression du filigrane',
          detail: 'Images Nano Banana restaurées sans perte',
        },
      ],
    },
    {
      title: 'Moins de clics',
      items: [
        {
          icon: 'quote',
          name: 'Réponse avec citation',
          detail: 'Sélectionnez un passage et posez une question dessus',
        },
        {
          icon: 'corner-down-left',
          name: 'Comportement d’envoi',
          detail: 'Entrée pour aller à la ligne, Ctrl/⌘+Entrée pour envoyer',
        },
        {
          icon: 'star',
          name: 'Modèle par défaut',
          detail: 'Les nouvelles conversations s’ouvrent sur votre modèle habituel',
        },
        {
          icon: 'git-branch',
          name: 'Bifurcation',
          detail: 'Repartez de n’importe quel échange pour tenter une autre piste',
        },
        {
          icon: 'sigma',
          name: 'Copie de formules',
          detail: 'Un clic pour copier en LaTeX ou en équation Word',
        },
      ],
    },
    {
      title: 'Écosystème ouvert',
      items: [
        {
          icon: 'puzzle',
          name: 'Plugins',
          detail: 'Plugins officiels, et aussi vos plugins locaux',
        },
        { icon: 'globe', name: 'Multi-sites', detail: 'Claude, ChatGPT et DeepSeek aussi' },
        {
          icon: 'monitor',
          name: 'Interfaces web locales',
          detail: 'La bibliothèque de prompts dans DeepSeek Harness et d’autres interfaces locales',
        },
        { icon: 'code', name: 'Synchro IDE', detail: 'Envoyez le contexte du chat vers VS Code' },
        {
          icon: 'panel-left-close',
          name: 'Barre latérale auto-masquée',
          detail: 'Elle se range dès que la souris s’éloigne',
        },
      ],
    },
  ],
};
