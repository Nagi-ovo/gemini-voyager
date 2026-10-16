import type { HomeFeaturesContent } from '../types';

export const es: HomeFeaturesContent = {
  timeline: {
    eyebrow: 'Línea de tiempo',
    title: 'Ve el pulso de la conversación.',
    body: 'Cada punto de la derecha es una pregunta que hiciste. Pasa el ratón para ver cuál es y haz clic para saltar a ella. Detente sobre el riel y aparece un botón de lista: abre una vista general de todo el chat en la que puedes buscar.',
    hint: 'Pruébalo: haz clic en un punto · mantén pulsado para destacar · pasa por el riel para ver la vista general',
    overview: 'Abrir la vista general del chat',
    searchPlaceholder: 'Buscar en este chat',
    noMatch: 'Ninguna pregunta coincide con «{q}»',
  },
  folders: {
    eyebrow: 'Carpetas',
    title: 'Dale un hogar a tus ideas.',
    body: 'Dentro de la barra lateral de Gemini y ChatGPT. Dos niveles, chats destacados arriba y con buscador.',
    hint: 'Pruébalo: abre otro chat · arrastra uno a una carpeta · busca «gata»',
    heading: 'Carpetas',
    searchPlaceholder: 'Buscar carpetas y chats',
    newFolder: 'Nueva carpeta',
    noMatch: 'Ninguna carpeta ni chat coincide con «{q}»',
    star: 'Destacar',
  },
  prompts: {
    eyebrow: 'Biblioteca de prompts',
    title: '¿Usar y tirar? Mejor guárdalo.',
    body: 'Guarda un prompt una vez y úsalo en cualquier interfaz web de IA, incluso en las locales como DeepSeek Harness.',
    hint: 'Pruébalo: elige uno, aparecerá en el cuadro de texto de la izquierda; después pulsa enviar',
    add: 'Añadir',
    searchPlaceholder: 'Buscar prompts o etiquetas',
    all: 'Todo',
    saved: 'Guardados',
    settings: 'Configuración',
    noMatch: 'Ningún prompt coincide con «{q}»',
  },
  composer: {
    replies: [
      'Esto es una demo, así que solo sé unas cuantas frases escritas de antemano. Pero tu mensaje acaba de añadir un punto a la línea de tiempo: mantenlo pulsado para destacarlo.',
      'Para una respuesta de verdad, pregúntale a tu IA de siempre. Si vas a repetir esta frase, guárdala con «{add}» en la biblioteca de prompts y la próxima vez estará a un clic.',
      'Recibido. Un truco de paso: arrastra esta conversación a una carpeta y no tendrás que rebuscar en el historial.',
      'Soy una respuesta de demo enlatada. Instala Voyager y esta línea de tiempo y esta biblioteca de prompts aparecerán en el Gemini, ChatGPT, Claude y DeepSeek que usas de verdad, y estas carpetas, en Gemini y ChatGPT.',
    ],
    placeholder: 'Pregunta lo que quieras o elige un prompt',
    send: 'Enviar',
    ball: 'Abrir la biblioteca de prompts',
  },
  demo: {
    replay: 'Repetir',
    close: 'Terminar la demo',
    prev: 'Función anterior',
    next: 'Función siguiente',
  },
  replyLeads: {
    table: 'Aquí tienes la tabla:',
    summary: 'En tres puntos:',
    todo: 'Ve tachando uno a uno:',
    plain: 'En pocas palabras:',
  },
  chats: {
    kyoto: {
      title: 'Tres días en Kioto',
      star: true,
      starred: [3],
      turns: [
        [
          'Voy a Kioto en noviembre. ¿Cómo organizo tres días?',
          'Noviembre es plena temporada de arces rojos. Reparte los días por zonas:\n- Día 1, Higashiyama: Kiyomizu-dera, Ninenzaka, santuario Yasaka\n- Día 2, Arashiyama: bosque de bambú, Tenryu-ji, tren panorámico\n- Día 3, Fushimi Inari y, por la tarde, el mercado Nishiki',
        ],
        [
          '¿A qué hora hay menos gente en Kiyomizu-dera?',
          'Entre la apertura, a las 6, y las 7. La luz de la mañana sobre la terraza es la más bonita, y los grupos llegan a partir de las 9.',
        ],
        [
          '¿Hay que reservar el tren de Arashiyama?',
          'En temporada de arces, sí: resérvalo en la web oficial con un mes de antelación. Siéntate a la derecha para ver el desfiladero del río Hozu.',
        ],
        [
          '¿En qué zona me alojo para moverme mejor?',
          'Cerca de la estación de Kioto o de Shijo-Kawaramachi. La estación te deja de camino a Fushimi y Arashiyama; Kawaramachi es mejor para cenar y pasear de noche.',
        ],
        [
          '¿Algún sitio de ramen sin cola?',
          'Evita las horas punta de las 12 y las 18 y casi ningún local tendrá cola. Cerca de Kawaramachi, los sitios pequeños de barrio suelen tener mesa sin esperar después de las 21.',
        ],
      ],
      extra: {
        table: [
          ['Día', 'Mañana', 'Tarde'],
          ['1', 'Kiyomizu-dera', 'Ninenzaka, santuario Yasaka'],
          ['2', 'Bosque de bambú', 'Tenryu-ji, tren panorámico'],
          ['3', 'Fushimi Inari', 'Mercado Nishiki'],
        ],
        summary: [
          'Una zona por día: Higashiyama, Arashiyama, Fushimi',
          'Kiyomizu-dera a las 6 y el tren reservado con un mes de antelación',
          'Alojarse cerca de la estación o en Kawaramachi y comer fuera de hora punta',
        ],
        translation:
          'Skip the noon and 6 pm rush and most ramen shops have no line. Around Kawaramachi, small neighborhood places usually have a free table after 9 pm.',
        todo: [
          'Reservar el tren de Arashiyama (un mes antes)',
          'Reservar hotel cerca de la estación de Kioto',
          'Mirar el horario de Kiyomizu-dera',
          'Comprar una tarjeta ICOCA',
        ],
      },
    },
    packing: {
      title: 'Lista para la maleta',
      turns: [
        [
          '¿Necesito un abrigo gordo para Kioto en noviembre?',
          'Por la mañana y por la noche rondan los 8 °C, y de día unos 15 °C. Con un plumífero ligero o un forro polar sobre manga larga vas bien.',
        ],
        [
          '¿Me funcionarán los cargadores en Japón?',
          'En Japón los enchufes son de dos clavijas planas (tipo A) a 100 V. Los cargadores del móvil y del portátil admiten 100–240 V, pero las clavijas redondas de aquí no entran: lleva un adaptador. La plancha del pelo de 230 V, mejor déjala en casa.',
        ],
        [
          '¿Suica o ICOCA?',
          'Las dos funcionan en Kansai. ICOCA es más habitual allí y la venden las máquinas de la estación de Kioto.',
        ],
      ],
      extra: {
        table: [
          ['Qué', '¿Llevar?', 'Nota'],
          ['Plumífero ligero', 'Sí', '8 °C por la mañana'],
          ['Adaptador de enchufe', 'Sí', 'Tipo A, 100 V'],
          ['Tarjeta de transporte', 'Allí', 'ICOCA'],
        ],
        summary: [
          'Basta con un plumífero ligero o un forro polar',
          'Enchufes tipo A a 100 V: lleva adaptador',
          'Compra la ICOCA en la estación de Kioto',
        ],
        translation:
          'Both work in Kansai, but ICOCA is more common there. You can buy one from the ticket machines at Kyoto Station.',
        todo: [
          'Plumífero ligero',
          'Dos camisetas de manga larga',
          'Adaptador tipo A y batería externa',
          'Pasaporte y reserva del hotel',
        ],
      },
    },
    dinner: {
      title: 'Qué cenar con lo que queda en la nevera',
      turns: [
        [
          'Tengo huevos, tomates y media cebolla. ¿Qué hago de cena?',
          'Un revuelto de tomate y cebolla, listo en diez minutos: pocha la cebolla, añade el tomate hasta que suelte el jugo y cuaja los huevos batidos removiendo a fuego suave.',
        ],
        [
          'También me apetece una sopa',
          'Con el último tomate haz una sopa rápida: sofríelo, añade agua, deja que hierva y escalfa un huevo dentro. Sal al gusto.',
        ],
        [
          '¿Y si no tengo perejil?',
          'Sin problema. Un poco de pimienta negra o un chorrito de aceite de oliva justo antes de servir funciona igual de bien.',
        ],
      ],
      extra: {
        table: [
          ['Plato', 'Ingredientes', 'Tiempo'],
          ['Revuelto de tomate y cebolla', '3 huevos, 1 tomate, media cebolla', '10 min'],
          ['Sopa de tomate con huevo', '1 tomate, 1 huevo', '8 min'],
        ],
        summary: [
          'Plato: revuelto de tomate y cebolla',
          'Sopa: tomate con huevo escalfado',
          '¿Sin perejil? Pimienta negra o aceite de oliva',
        ],
        translation:
          'No problem. A little black pepper or a drizzle of olive oil right before serving works just as well.',
        todo: [
          'Tostar un poco de pan',
          'Pochar la cebolla',
          'Hacer el revuelto',
          'Preparar la sopa',
        ],
      },
    },
    week: {
      title: 'Una semana de tápers',
      turns: [
        [
          'Organízame una semana de tápers para el trabajo, nada complicado',
          'El domingo cocina tres platos de una vez: muslos de pollo al horno, ternera guisada con tomate y brócoli salteado con ajo. Congélalos en raciones y cada día laborable coge una con arroz recién hecho.',
        ],
        [
          '¿Puedo gastar menos de 5 € al día?',
          'Sí. Compra los muslos y la carne para guisar en bandejas grandes y elige brócoli de temporada: cada ración sale por unos 3,50 €.',
        ],
      ],
      extra: {
        table: [
          ['Día', 'Plato'],
          ['Lun', 'Pollo al horno'],
          ['Mar', 'Ternera con tomate'],
          ['Mié', 'Pollo al horno'],
          ['Jue', 'Ternera con tomate'],
          ['Vie', 'Brócoli con ajo y pollo'],
        ],
        summary: [
          'Tres platos cocinados el domingo y congelados en raciones',
          'Entre semana, solo hacer el arroz',
          'Unos 3,50 € por ración',
        ],
        translation:
          'Yes. Buy the chicken thighs and stewing beef in large trays and pick seasonal broccoli: each portion comes to about €3.50.',
        todo: [
          '1 kg de muslos de pollo',
          '700 g de ternera para guisar',
          '3 brócolis',
          '10 tápers',
        ],
      },
    },
    landlord: {
      title: 'Avisar a la casera de que el calentador no va',
      turns: [
        [
          'Se me ha estropeado el calentador. ¿Cómo se lo digo a la casera?',
          'Cuéntale qué pasa y desde cuándo, pregúntale qué día le viene bien para mandar a alguien y dile cuándo estás en casa.',
        ],
        [
          'Escríbeme el WhatsApp',
          'Hola, Carmen. El calentador no enciende desde anoche y no tenemos agua caliente. ¿Podrías mandar a alguien a arreglarlo estos días? Entre semana estoy en casa por las tardes, y los fines de semana también. ¡Muchas gracias!',
        ],
      ],
      extra: {
        table: [
          ['Punto', 'Qué decir'],
          ['Problema', 'No enciende desde anoche'],
          ['Petición', 'Mandar a alguien a arreglarlo'],
          ['Disponibilidad', 'Tardes entre semana y fines de semana'],
        ],
        summary: [
          'Contar qué pasa y desde cuándo',
          'Pedir que manden a alguien',
          'Decir cuándo estás en casa',
        ],
        translation:
          "Hi Carmen, the water heater hasn't come on since last night and we have no hot water. Could you send someone to fix it in the next few days? I'm home on weekday evenings and at weekends too. Thanks so much!",
        todo: [
          'Grabar el error del calentador',
          'Mandar el WhatsApp',
          'Quedar en una hora para la reparación',
        ],
      },
    },
    run: {
      title: 'Me duele la rodilla al correr',
      turns: [
        [
          'Me duele la parte de fuera de la rodilla al correr. ¿Puedo seguir corriendo?',
          'El dolor en la cara externa de la rodilla suele venir de la cintilla iliotibial. Descansa de tres a cinco días y vuelve con rodajes cortos y suaves. Si te duele al caminar, ve a un médico deportivo.',
        ],
        [
          '¿Algún estiramiento?',
          '- Rodillo de espuma en la cara externa del muslo, 2 minutos por lado\n- Estiramiento de pie con piernas cruzadas, 30 segundos por lado\n- Elevaciones de pierna tumbado de lado, 15 por lado',
        ],
      ],
      extra: {
        table: [
          ['Ejercicio', 'Cantidad'],
          ['Rodillo de espuma', '2 min por lado'],
          ['Piernas cruzadas', '30 s por lado'],
          ['Elevación lateral', '15 por lado'],
        ],
        summary: [
          'El dolor externo suele ser la cintilla iliotibial',
          'Descansar de tres a cinco días',
          'Rodillo y fortalecer la cadera a diario',
        ],
        translation:
          '- Foam-roll the outer thigh, 2 minutes per side\n- Standing cross-leg stretch, 30 seconds per side\n- Side-lying leg raises, 15 reps per side',
        todo: [
          'Tres días sin correr',
          'Rodillo todos los días',
          'Tres series de elevaciones al día',
          'Volver con 3 km',
        ],
      },
    },
    cat: {
      title: 'Mi gata apenas come',
      turns: [
        [
          'Mi gata lleva dos días sin querer el pienso. ¿Es normal?',
          'Primero fíjate en si está activa, si bebe y si usa el arenero. Si está bien y solo se ha vuelto tiquismiquis, prueba otro sabor. Si pasa más de 24 horas sin comer nada, llévala pronto al veterinario.',
        ],
        [
          '¿Cómo le cambio el pienso?',
          'Hazlo en siete días: un cuarto de pienso nuevo los dos primeros días, la mitad los tres siguientes y tres cuartos los dos últimos.',
        ],
      ],
      extra: {
        table: [
          ['Días', 'Pienso nuevo'],
          ['1–2', '25 %'],
          ['3–5', '50 %'],
          ['6–7', '75 %'],
        ],
        summary: [
          'Mirar si está activa, bebe y usa el arenero',
          '24 horas sin comer: al veterinario',
          'Cambiar el pienso en siete días',
        ],
        translation:
          'Switch over seven days: a quarter new food for the first two days, half for the next three, and three quarters for the last two.',
        todo: [
          'Apuntar cuánto come hoy',
          'Comprar una bolsa pequeña de otro sabor',
          'Seguir la mezcla de siete días',
        ],
      },
    },
    headphones: {
      title: 'Elegir auriculares con cancelación de ruido',
      turns: [
        [
          '¿Cómo elijo unos auriculares con cancelación de ruido para ir en metro?',
          'Fija un presupuesto y compara tres cosas: cancelación de ruido, comodidad y batería. En un metro ruidoso, prioriza la cancelación; si los llevas puestos horas, importa más la comodidad.',
        ],
        [
          '¿Molestan si llevo gafas?',
          'Sí. Los de diadema presionan las patillas de las gafas y pierden aislamiento. Si llevas gafas, los intrauditivos son mejor opción.',
        ],
      ],
      extra: {
        table: [
          ['Tipo', 'Cancelación', 'Con gafas'],
          ['De diadema', 'Más fuerte', 'Presionan las patillas'],
          ['Intrauditivos', 'Suficiente', 'Sin problema'],
        ],
        summary: [
          'Primero, el presupuesto',
          'Para el metro, prioriza la cancelación',
          '¿Llevas gafas? Intrauditivos',
        ],
        translation:
          'Yes. Over-ear headphones press on the arms of your glasses and break the seal. If you wear glasses, in-ear buds are the better choice.',
        todo: [
          'Fijar un presupuesto',
          'Probar dos modelos en tienda',
          'Comparar batería y tamaño del estuche',
        ],
      },
    },
  },
  tree: [
    {
      folder: 'Viajes',
      open: true,
      kids: [{ folder: 'Kioto', open: true, kids: [{ chat: 'kyoto' }, { chat: 'packing' }] }],
    },
    { folder: 'Cocina', kids: [{ chat: 'dinner' }, { chat: 'week' }] },
    { chat: 'landlord' },
    { chat: 'run' },
    { chat: 'cat' },
    { chat: 'headphones' },
  ],
  current: 'kyoto',
  promptList: [
    {
      name: 'Pasar a tabla',
      tag: 'Organizar',
      text: 'Pasa lo anterior a una tabla.',
      reply: 'table',
    },
    {
      name: 'Resumir en tres puntos',
      tag: 'Organizar',
      text: 'Resume este chat en tres puntos.',
      reply: 'summary',
    },
    {
      name: 'Hacer una checklist',
      tag: 'Organizar',
      text: 'Dame una lista para ir tachando.',
      reply: 'todo',
    },
    {
      name: 'Traducir al inglés',
      tag: 'Traducir',
      text: 'Traduce tu última respuesta a un inglés natural.',
      reply: 'translate',
    },
    {
      name: 'Explícamelo fácil',
      tag: 'Aprender',
      text: 'Dilo otra vez con palabras sencillas.',
      reply: 'plain',
    },
  ],
  groups: [
    {
      title: 'Experiencia visual',
      items: [
        {
          icon: 'move-horizontal',
          name: 'Ancho del chat',
          detail: 'Ensancha el chat para que quepan el código y las tablas',
        },
        {
          icon: 'a-large-small',
          name: 'Tamaño de fuente',
          detail: 'Ajusta el tamaño del texto del chat por separado',
        },
        { icon: 'clock-3', name: 'Marcas de tiempo', detail: 'La hora de envío de cada mensaje' },
        {
          icon: 'workflow',
          name: 'Gráficos Mermaid',
          detail: 'Diagramas de flujo y de secuencia renderizados al momento',
        },
        {
          icon: 'snowflake,rain,sakura',
          name: 'Efectos visuales',
          detail: 'Nieve, lluvia o flores de cerezo',
        },
      ],
    },
    {
      title: 'Tus datos',
      items: [
        { icon: 'file-down', name: 'Exportar chats', detail: 'Markdown, PDF, JSON o imagen' },
        {
          icon: 'microscope',
          name: 'Exportar Deep Research',
          detail: 'Con el razonamiento y los enlaces a las fuentes',
        },
        {
          icon: 'cloud',
          name: 'Sincronización en la nube',
          detail: 'Google Drive, o iCloud en Safari',
        },
        {
          icon: 'list-x',
          name: 'Eliminación por lote',
          detail: 'Marca varios chats y bórralos de una vez',
        },
        {
          icon: 'image',
          name: 'Quitar marca de agua',
          detail: 'Imágenes de Nano Banana restauradas sin pérdida',
        },
      ],
    },
    {
      title: 'Menos pasos',
      items: [
        {
          icon: 'quote',
          name: 'Respuesta con cita',
          detail: 'Selecciona un fragmento y pregunta sobre él',
        },
        {
          icon: 'corner-down-left',
          name: 'Comportamiento de envío',
          detail: 'Enter para salto de línea, Ctrl/⌘+Enter para enviar',
        },
        {
          icon: 'star',
          name: 'Modelo predeterminado',
          detail: 'Los chats nuevos se abren con tu modelo de siempre',
        },
        {
          icon: 'git-branch',
          name: 'Bifurcación',
          detail: 'Parte de cualquier turno y prueba otro enfoque',
        },
        {
          icon: 'sigma',
          name: 'Copia de fórmulas',
          detail: 'Un clic para copiar en LaTeX o como ecuación de Word',
        },
      ],
    },
    {
      title: 'Ecosistema abierto',
      items: [
        {
          icon: 'puzzle',
          name: 'Plugins',
          detail: 'Plugins oficiales y también tus plugins locales',
        },
        {
          icon: 'globe',
          name: 'Funciona en más sitios',
          detail: 'También en Claude, ChatGPT y DeepSeek',
        },
        {
          icon: 'monitor',
          name: 'Interfaces web locales',
          detail: 'Usa la biblioteca de prompts en DeepSeek Harness y otras interfaces locales',
        },
        {
          icon: 'code',
          name: 'Conexión con el IDE',
          detail: 'Envía el contexto del chat a VS Code',
        },
        {
          icon: 'panel-left-close',
          name: 'Ocultar barra lateral',
          detail: 'Se recoge en cuanto apartas el ratón',
        },
      ],
    },
  ],
};
