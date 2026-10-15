import type { HomeFeaturesContent } from '../types';

export const en: HomeFeaturesContent = {
  timeline: {
    eyebrow: 'Timeline',
    title: "Don't scroll. Fly.",
    body: 'Each dot on the right is a question you asked. Hover to see which one, click to jump there. Rest on the rail and a list button appears: it opens an overview of the whole chat that you can search.',
    hint: 'Try it: click a dot · press and hold to star · hover the rail for the overview',
    overview: 'Open chat overview',
    searchPlaceholder: 'Search this chat',
    noMatch: 'No questions match "{q}"',
  },
  folders: {
    eyebrow: 'Folders',
    title: 'A home for your thoughts.',
    body: 'Right inside the Gemini and ChatGPT sidebars. Two levels deep, starred chats on top, searchable.',
    hint: 'Try it: open another chat · drag one into a folder · search "cat"',
    heading: 'Folders',
    searchPlaceholder: 'Search folders and chats',
    newFolder: 'New folder',
    noMatch: 'No folders or chats match "{q}"',
    star: 'Star',
  },
  prompts: {
    eyebrow: 'Prompt library',
    title: 'Catch the spark.',
    body: 'Save a prompt once and call it up in any AI web UI, even local ones like DeepSeek Harness.',
    hint: 'Try it: pick one, it lands in the input on the left, then press send',
    add: 'Add',
    searchPlaceholder: 'Search prompts or tags',
    all: 'All',
    saved: 'Saved',
    settings: 'Settings',
    noMatch: 'No prompts match "{q}"',
  },
  composer: {
    replies: [
      'This is a demo, so I only know a few prewritten lines. But your message just grew a new dot on the timeline: press and hold it to star it.',
      "For a real answer, ask your AI of choice. If you'll say this again, save it with “{add}” in the prompt library and it's one click away next time.",
      "Got it. Quick tip while you're here: drag this chat into a folder and you'll never have to dig through your history for it.",
      "I'm a canned demo reply. Install Voyager and this timeline and prompt library show up in the Gemini, ChatGPT, Claude and DeepSeek you actually use, and these folders in Gemini and ChatGPT.",
    ],
    placeholder: 'Ask anything, or pick a prompt',
    send: 'Send',
    ball: 'Open the prompt library',
  },
  demo: { replay: 'Replay', close: 'End demo', prev: 'Previous feature', next: 'Next feature' },
  replyLeads: {
    table: 'Here it is as a table:',
    summary: 'In three points:',
    todo: 'Tick these off one by one:',
    plain: 'In plain words:',
  },
  chats: {
    kyoto: {
      title: 'Three days in Kyoto',
      star: true,
      starred: [3],
      turns: [
        [
          "I'm going to Kyoto in November. How should I plan three days?",
          'November is peak autumn-leaf season. Split the days by area:\n- Day 1, Higashiyama: Kiyomizu-dera, Ninenzaka, Yasaka Shrine\n- Day 2, Arashiyama: bamboo grove, Tenryu-ji, the scenic train\n- Day 3, Fushimi Inari, then Nishiki Market in the afternoon',
        ],
        [
          'When is Kiyomizu-dera least crowded?',
          'Between opening at 6 and 7 am. The morning light on the stage is at its best too, and tour groups arrive after 9.',
        ],
        [
          'Do I need to book the Arashiyama train?',
          'In leaf season, book on the official site a month ahead. Sit on the right for the view over the Hozu gorge.',
        ],
        [
          'Which area is easiest for getting around?',
          'Near Kyoto Station or Shijo-Kawaramachi. The station is on the way to Fushimi and Arashiyama; Kawaramachi is better for dinner and evening walks.',
        ],
        [
          'Any ramen places without a queue?',
          'Skip the noon and 6 pm rush and most shops have no line. Around Kawaramachi, small local spots are usually walk-in after 9 pm.',
        ],
      ],
      extra: {
        table: [
          ['Day', 'Morning', 'Afternoon'],
          ['1', 'Kiyomizu-dera', 'Ninenzaka, Yasaka Shrine'],
          ['2', 'Bamboo grove', 'Tenryu-ji, scenic train'],
          ['3', 'Fushimi Inari', 'Nishiki Market'],
        ],
        summary: [
          'Split the trip by area: Higashiyama, Arashiyama, Fushimi',
          'Go to Kiyomizu-dera at 6 am and book the train a month ahead',
          'Stay near Kyoto Station or Kawaramachi and eat off-peak',
        ],
        translation:
          'Evita las horas punta de las 12 y las 18 y casi ningún local tendrá cola. Cerca de Kawaramachi, los sitios pequeños suelen tener mesa sin esperar después de las 21.',
        todo: [
          'Book the Arashiyama train (a month ahead)',
          'Book a hotel near Kyoto Station',
          'Check Kiyomizu-dera opening hours',
          'Get an ICOCA card',
        ],
      },
    },
    packing: {
      title: 'Packing list',
      turns: [
        [
          'Do I need a heavy coat for Kyoto in November?',
          'Mornings and evenings are around 8 °C, days around 15 °C. A light down or fleece jacket over long sleeves is enough.',
        ],
        [
          'Will my plugs work in Japan?',
          'Japan uses two flat pins (type A) at 100 V. Phone and laptop chargers handle the voltage, so you only need an adapter if your plugs are a different shape.',
        ],
        [
          'Suica or ICOCA?',
          'Both work in Kansai. ICOCA is more common there, and the ticket machines at Kyoto Station sell it.',
        ],
      ],
      extra: {
        table: [
          ['Item', 'Bring it?', 'Note'],
          ['Light down jacket', 'Yes', '8 °C mornings'],
          ['Plug adapter', 'Maybe', 'Type A, 100 V'],
          ['Transit card', 'Buy there', 'ICOCA'],
        ],
        summary: [
          'A light down or fleece jacket is enough',
          'Japan uses type A plugs at 100 V',
          'Buy an ICOCA card at Kyoto Station',
        ],
        translation:
          'Las dos funcionan en Kansai, pero ICOCA es más común allí. Puedes comprarla en las máquinas de la estación de Kioto.',
        todo: [
          'Light down jacket',
          'Two long-sleeve tops',
          'Chargers and a power bank',
          'Passport and hotel confirmation',
        ],
      },
    },
    dinner: {
      title: "What's for dinner from the fridge",
      turns: [
        [
          'I have eggs, tomatoes and half an onion. What can I make tonight?',
          'Tomato and egg stir-fry is ready in ten minutes: scramble the eggs and set them aside, cook the onion and tomato until saucy, then fold the eggs back in.',
        ],
        [
          'I want a soup too',
          'Use the last tomato for egg drop soup: soften it, add water, bring to a boil, drizzle in a beaten egg and salt to taste.',
        ],
        [
          'Is it fine without spring onions?',
          'Yes. A pinch of black pepper or a few drops of sesame oil right before serving works just as well.',
        ],
      ],
      extra: {
        table: [
          ['Dish', 'Ingredients', 'Time'],
          ['Tomato egg stir-fry', '3 eggs, 1 tomato, half an onion', '10 min'],
          ['Egg drop soup', '1 tomato, 1 egg', '8 min'],
        ],
        summary: [
          'Main: tomato and egg stir-fry',
          'Soup: tomato egg drop soup',
          'No spring onions? Use black pepper or sesame oil',
        ],
        translation:
          'Sí. Una pizca de pimienta negra o unas gotas de aceite de sésamo justo antes de servir funcionan igual de bien.',
        todo: ['Cook the rice', 'Scramble the eggs', 'Cook the tomato and onion', 'Make the soup'],
      },
    },
    week: {
      title: 'A week of packed lunches',
      turns: [
        [
          'Plan a week of packed lunches for me, nothing complicated',
          'Batch-cook three mains on Sunday: soy-braised chicken legs, tomato beef stew and garlic broccoli. Freeze them in portions, then grab one each weekday with freshly cooked rice.',
        ],
        [
          'Can I keep it under $5 a day?',
          'Yes. Buy chicken legs and stewing beef in family packs and pick seasonal broccoli; each portion comes to about $3.50.',
        ],
      ],
      extra: {
        table: [
          ['Day', 'Main'],
          ['Mon', 'Braised chicken'],
          ['Tue', 'Tomato beef stew'],
          ['Wed', 'Braised chicken'],
          ['Thu', 'Tomato beef stew'],
          ['Fri', 'Garlic broccoli with chicken'],
        ],
        summary: [
          'Batch-cook three mains on Sunday and freeze them',
          'Only cook rice on weekdays',
          'About $3.50 a portion',
        ],
        translation:
          'Sí. Compra muslos de pollo y carne para guisar en paquetes grandes y brócoli de temporada; cada ración sale por unos 3,50 $.',
        todo: ['2 lb chicken legs', '1.5 lb stewing beef', '3 heads of broccoli', '10 lunch boxes'],
      },
    },
    landlord: {
      title: 'Telling the landlord the heater broke',
      turns: [
        [
          'My water heater broke. How should I tell my landlord?',
          'Say what happened and since when, ask which day suits them for a repair, and mention when you are home.',
        ],
        [
          'Write the message for me',
          "Hi Sarah, the water heater hasn't been able to ignite since last night, so there's no hot water. Could you arrange for someone to fix it in the next couple of days? I'm home on weekday evenings and weekends. Thanks!",
        ],
      ],
      extra: {
        table: [
          ['Point', 'What to say'],
          ['Problem', "Won't ignite since last night"],
          ['Request', 'Send someone to repair it'],
          ['Availability', 'Weekday evenings and weekends'],
        ],
        summary: [
          'Say what happened and since when',
          'Ask them to arrange a repair',
          'Say when you are home',
        ],
        translation:
          'Hola Sarah, el calentador no enciende desde anoche y no hay agua caliente. ¿Podrías mandar a alguien a repararlo en los próximos días? Estoy en casa entre semana por la tarde y los fines de semana. ¡Gracias!',
        todo: ['Film the error on the heater', 'Send the message', 'Agree on a repair time'],
      },
    },
    run: {
      title: 'Knee pain when running',
      turns: [
        [
          'The outside of my knee hurts when I run. Can I keep running?',
          'Pain on the outside of the knee is often a tight IT band. Rest for three to five days, then come back with short easy runs. If it hurts when walking, see a sports medicine doctor.',
        ],
        [
          'Any stretches?',
          '- Foam-roll the outer thigh, 2 minutes per side\n- Standing cross-leg stretch, 30 seconds per side\n- Side-lying leg raises, 15 reps per side',
        ],
      ],
      extra: {
        table: [
          ['Exercise', 'Amount'],
          ['Foam roll', '2 min per side'],
          ['Cross-leg stretch', '30 s per side'],
          ['Side-lying leg raise', '15 per side'],
        ],
        summary: [
          'Outer knee pain is usually a tight IT band',
          'Rest for three to five days',
          'Foam-roll and strengthen your hips daily',
        ],
        translation:
          '- Rodillo de espuma en la cara externa del muslo, 2 minutos por lado\n- Estiramiento de pie con piernas cruzadas, 30 segundos por lado\n- Elevaciones de pierna tumbado de lado, 15 por lado',
        todo: [
          'Rest for three days',
          'Foam-roll every day',
          'Three sets of leg raises a day',
          'Restart with a 3 km run',
        ],
      },
    },
    cat: {
      title: "My cat isn't eating much",
      turns: [
        [
          "My cat hasn't wanted her food for two days. Is that normal?",
          'Check her energy, drinking and litter box first. If she seems fine and is just picky, try a new flavor. If she eats nothing for over 24 hours, see a vet soon.',
        ],
        [
          'How do I switch foods?',
          'Take seven days: a quarter new food for the first two days, half for the next three, and three quarters for the last two.',
        ],
      ],
      extra: {
        table: [
          ['Days', 'New food'],
          ['1–2', '25%'],
          ['3–5', '50%'],
          ['6–7', '75%'],
        ],
        summary: [
          'Check energy, drinking and the litter box',
          'Nothing for 24 hours means a vet visit',
          'Switch foods over seven days',
        ],
        translation:
          'Hazlo en siete días: un cuarto de comida nueva los dos primeros días, la mitad los tres siguientes y tres cuartos los dos últimos.',
        todo: [
          'Note how much she eats today',
          'Buy a small bag of a new flavor',
          'Follow the seven-day mix',
        ],
      },
    },
    headphones: {
      title: 'Choosing noise-cancelling headphones',
      turns: [
        [
          'How do I pick noise-cancelling headphones for my commute?',
          'Set a budget, then compare noise cancelling, comfort and battery life. On a loud train, prioritize cancelling; if you wear them for hours, comfort matters more.',
        ],
        [
          'Do glasses get in the way?',
          'Yes. Over-ear cups press on the arms of your glasses and break the seal. Earbuds are the easier choice if you wear glasses.',
        ],
      ],
      extra: {
        table: [
          ['Type', 'Cancelling', 'With glasses'],
          ['Over-ear', 'Stronger', 'Presses on the arms'],
          ['Earbuds', 'Good enough', 'No problem'],
        ],
        summary: [
          'Set a budget first',
          'For trains, prioritize noise cancelling',
          'Wear glasses? Choose earbuds',
        ],
        translation:
          'Sí. Los auriculares de diadema presionan las patillas de las gafas y pierden aislamiento. Si llevas gafas, los intrauditivos son mejor opción.',
        todo: ['Set a budget', 'Try two pairs in a store', 'Compare battery life and case size'],
      },
    },
  },
  tree: [
    {
      folder: 'Travel',
      open: true,
      kids: [{ folder: 'Kyoto', open: true, kids: [{ chat: 'kyoto' }, { chat: 'packing' }] }],
    },
    { folder: 'Cooking', kids: [{ chat: 'dinner' }, { chat: 'week' }] },
    { chat: 'landlord' },
    { chat: 'run' },
    { chat: 'cat' },
    { chat: 'headphones' },
  ],
  current: 'kyoto',
  promptList: [
    {
      name: 'Make it a table',
      tag: 'Organize',
      text: 'Turn the above into a table.',
      reply: 'table',
    },
    {
      name: 'Sum up in three points',
      tag: 'Organize',
      text: 'Sum up this chat in three points.',
      reply: 'summary',
    },
    {
      name: 'Turn into a checklist',
      tag: 'Organize',
      text: 'Give me a checklist I can tick off.',
      reply: 'todo',
    },
    {
      name: 'Translate to Spanish',
      tag: 'Translate',
      text: 'Translate your last reply into natural Spanish.',
      reply: 'translate',
    },
    { name: 'Say it simply', tag: 'Learn', text: 'Say that again in plain words.', reply: 'plain' },
  ],
  groups: [
    {
      title: 'Look & feel',
      items: [
        {
          icon: 'move-horizontal',
          name: 'Chat width',
          detail: 'Widen the chat so code and tables fit',
        },
        { icon: 'a-large-small', name: 'Font size', detail: 'Set the chat font size on its own' },
        { icon: 'clock-3', name: 'Timestamps', detail: 'See when each message was sent' },
        {
          icon: 'workflow',
          name: 'Mermaid diagrams',
          detail: 'Flowcharts and sequence diagrams render in place',
        },
        {
          icon: 'snowflake,rain,sakura',
          name: 'Visual effects',
          detail: 'Snow, rain or cherry blossoms',
        },
      ],
    },
    {
      title: 'Your data',
      items: [
        { icon: 'file-down', name: 'Chat export', detail: 'Markdown, PDF, JSON or image' },
        {
          icon: 'microscope',
          name: 'Deep Research export',
          detail: 'With the thinking and source links',
        },
        { icon: 'cloud', name: 'Cloud sync', detail: 'Google Drive, or iCloud in Safari' },
        { icon: 'list-x', name: 'Batch delete', detail: 'Select chats and delete them at once' },
        {
          icon: 'image',
          name: 'Watermark removal',
          detail: 'Restore Nano Banana images losslessly',
        },
      ],
    },
    {
      title: 'Fewer steps',
      items: [
        { icon: 'quote', name: 'Quote reply', detail: 'Select a passage and ask about it' },
        {
          icon: 'corner-down-left',
          name: 'Send behavior',
          detail: 'Enter for a new line, Ctrl/⌘+Enter to send',
        },
        { icon: 'star', name: 'Default model', detail: 'New chats open in your usual model' },
        {
          icon: 'git-branch',
          name: 'Chat branches',
          detail: 'Fork from any turn and try another angle',
        },
        { icon: 'sigma', name: 'Formula copy', detail: 'Click to copy LaTeX or a Word equation' },
      ],
    },
    {
      title: 'Open ecosystem',
      items: [
        {
          icon: 'puzzle',
          name: 'Plugin store',
          detail: 'Official plugins, plus your own local ones',
        },
        { icon: 'globe', name: 'Works across sites', detail: 'Claude, ChatGPT and DeepSeek too' },
        {
          icon: 'monitor',
          name: 'Local web UIs',
          detail: 'Use the prompt library in DeepSeek Harness and other local UIs',
        },
        { icon: 'code', name: 'IDE connection', detail: 'Send chat context to VS Code' },
        {
          icon: 'panel-left-close',
          name: 'Sidebar auto-hide',
          detail: 'The sidebar tucks away when you move off it',
        },
      ],
    },
  ],
};
