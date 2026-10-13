---
title: Vue Activity
description: Classez les conversations des dossiers selon leur activité réelle afin de faire remonter le travail encore en cours.
---

# Activity : garder son attention sur les conversations en mouvement

Les dossiers répondent à une question : où ranger cette conversation ? À mesure que les archives grandissent, une autre question revient plus souvent : que faut-il regarder maintenant ?

Activity est une vue chronologique construite par-dessus les dossiers. Cliquez sur la cloche à côté de **Dossiers** pour remplacer l'arborescence par les conversations classées selon leur activité réelle. Vos dossiers, leur contenu et l'état des favoris ne sont pas modifiés.

**Inspiration :** cette vue s'inspire de la barre latérale de Codex / ChatGPT Desktop d'OpenAI. Voyager reprend l'idée de faire remonter les conversations encore actives, puis l'adapte en une vue chronologique sur les dossiers Gemini.

<img src="/assets/activity-view.png" alt="La vue d'attention Activity dans la barre latérale de Gemini" style="display: block; width: 100%; max-width: 517px; margin: 24px auto; border-radius: 14px; box-shadow: 0 12px 32px rgba(0,0,0,0.12);"/>

## La priorité suit l'activité récente

**Priorité** (Priority) contient les conversations qui ont reçu un nouvel échange au cours des **trois dernières heures**. La vue utilise l'heure réelle de la conversation, et non le moment où vous l'avez ouverte ou consultée.

Une conversation placée dans Priorité n'apparaît pas aussi dans **Aujourd'hui** (Today). À la fin de sa fenêtre d'activité de trois heures, Activity la replace automatiquement dans Aujourd'hui ou dans le groupe de date correspondant. Inutile de recharger la page.

Le favori (Star) reste disponible comme marqueur manuel indépendant. Ajouter un favori ne fait pas entrer une conversation dans Priorité, et retirer un favori ne fait pas sortir une conversation active de Priorité.

## Une courte fenêtre sur les derniers jours

Sous Priorité, Activity affiche **Aujourd'hui** (Today), **Hier** (Yesterday), puis les jours de la semaine précédents. La vue couvre aujourd'hui et les quatre jours calendaires précédents, pour que la liste reste proche du travail en cours.

Les conversations plus anciennes, ainsi que les entrées sans heure d'activité, n'apparaissent pas ici. Elles ne sont ni masquées ni supprimées. Cliquez à nouveau sur la cloche pour revenir à l'arborescence et les retrouver à leur emplacement d'origine.

## Une conversation, une seule ligne

Une conversation peut appartenir à plusieurs dossiers. Activity fusionne ces références en une seule ligne, et conserve les noms des dossiers sous le titre. Survolez le contexte des dossiers pour afficher les chemins complets.

Une même conversation n'occupe ainsi pas plusieurs places dans Priorité ou dans Aujourd'hui, tout en conservant le contexte de ses projets.

## Trois signaux, trois usages

| Signal   | Source                               | Question à laquelle il répond                   |
| -------- | ------------------------------------ | ----------------------------------------------- |
| Dossiers | Projets et thèmes que vous organisez | Où appartient cette conversation ?              |
| Activity | Heure du dernier échange réel        | Quels travaux ont avancé récemment ?            |
| Star     | Marqueur manuel                      | Quelles conversations doivent rester marquées ? |

Les dossiers servent à retrouver un élément dans les archives. Activity réduit les choix à faire chaque fois que vous revenez dans Gemini. Commencez par une conversation qui a encore de l'élan dans Priorité, poursuivez avec Aujourd'hui ou Hier, puis revenez à l'arborescence complète lorsque vous avez besoin de contenus plus anciens.

## Où cela fonctionne

Activity est disponible dans la barre latérale des dossiers de Gemini, ainsi que dans la section des dossiers de ChatGPT (elle fait partie de l'extension Dossiers intégrée à ChatGPT).
