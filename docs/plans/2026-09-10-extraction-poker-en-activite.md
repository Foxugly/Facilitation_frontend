# Étape 3 — extraire le poker de `room.component` en première activité

> Analyse préalable, faite le 2026-09-10. L'exécution se fait en trois passes,
> chacune validée par les 10 scénarios e2e **et par un contrôle visuel** — voir
> la mise en garde plus bas, elle est le point le plus important de ce document.

## Pourquoi ce découpage

`room.component` pèse **659 lignes de TS, 305 de HTML, 938 de SCSS**. La
cartographie de ses membres montre que l'essentiel est déjà de l'activité, pas du
shell — c'est ce qui rend l'extraction possible sans rien réécrire.

| Nature | Membres |
|---|---|
| **Shell** (générique, reste) | identité, socket, thème de page (`backgroundColor`, `backgroundImage`, `hasCustomBackground`), QR et partage (`copyCode`, `shareLink`, `joinUrl`, `closeQr`), participants (`initials`, `avatarColor`), autorité (`transfer`, `claim`, `showPanel`, `isFacilitator`), plein écran, `quit` |
| **Activité poker** (part) | tapis et sièges (`seats`, `feltAspect`, `seatCardFraction`, `feltColor`, `feltImage`, `cardBackColor`, `cardBackImage`), main (`handVisible`, `votable`, `cardValues`), dépouillement (`outcomeGroups`, `outcomeMax`, `outcomeWinner`, `decidedCard`, `resultLayout`, `resultName`), panneau (agenda, composition, timer, decks, mode de révélation), machine à états (`state`, `canOpen`, `canReveal`, `panelFrozen`, `showComposeForm`) |

## Les trois passes

### 3a — le panneau facilitateur

Le plus autonome. HTML lignes **167-278** (`@if (isFacilitator())` … `</aside>`).

TS à déplacer : `subjectDraft`, `chosenValue`, `deckDraft`, `anonymousDraft`,
`editing`, `timerEnabledDraft`, `timerSecondsDraft`, `timerSuffix`,
`showComposeForm`, `showPrepared`, `canPrepare`, `canOpen`, `canReveal`,
`panelFrozen`, `canSetRevealMode`, `canSwitchDeck`, `availableDecks`,
`deckOptions`, `currentDeckId`, `cardOptions`, `agendaResultName`, `prepare`,
`selectAgenda`, `launch`, `enterCompose`, `queueSubject`, `act`, `modeValue`,
`roundDetails`, les quatre `on*Change`, et l'effet qui synchronise les brouillons
de timer.

**Le composant injecte `RoomSocketService` directement** — inutile de faire
transiter l'état par des `input()`, le service est déjà partagé.

### 3b — tapis, main et dépouillement

Le reste du HTML de l'activité. Plus gros, mais plus homogène.

### 3c — le shell

Ce qui reste doit se réduire à l'en-tête, aux participants, au thème et au QR.
C'est la passe de vérification : si `room.component` garde encore du vocabulaire
de poker, le découpage des deux passes précédentes est incomplet.

## ⚠️ Le piège : les tests e2e ne protègent PAS le rendu

Les 10 scénarios cliquent des boutons et vérifient des comportements. **Aucun ne
compare un pixel.** Une régression de style les laisserait tous verts.

Or Angular encapsule les styles par composant : le HTML déplacé chez un enfant
**perd les règles restées chez le parent**. Le SCSS doit donc suivre le HTML,
et c'est là que se situe le risque réel de cette étape.

### Bornes relevées dans `room.component.scss`

Le bloc du panneau va de **626 (`.fac-panel`) à 836**, contigu — mais avec deux
exceptions à ne pas emporter :

- **`.reveal-badge` (803-816)** est dans ce bloc mais sert à l'**en-tête** de la
  salle (`room.component.html:36`), pas au panneau. Il reste chez le shell.
- **`@media (max-width: 768px)` (837+)** mêle des règles du panneau et du reste.
  Il faut le scinder, pas le déplacer en bloc.

Classes du panneau : `fac-panel`, `agenda`, `agenda-item`, `agenda-line`,
`agenda-text`, `agenda-result`, `agenda-empty`, `panel-block`, `controls`,
`act-row`, `round-form`, `round-ready`, `ready-subject`, `deck-settings`,
`reveal-settings`, `reveal-row`, `reveal-mode-name`, `timer-settings`,
`timer-row`, `timer-icon`, `guard`.

Note : `.panel-block.guard` (665) sert **aussi** au bloc « reprendre le rôle »
affiché aux non-facilitateurs (HTML 279-288), qui reste dans le shell. Cette
règle doit être **dupliquée**, pas déplacée.

### Protocole de vérification par passe

1. `npx playwright test` — les 10 scénarios verts (comportement)
2. **Contrôle visuel** de la salle dans les quatre états (`idle`, `open`,
   `revealed`, `acted`), en facilitateur et en votant, plus une salle d'équipe
   pour le timer et le sélecteur de deck
3. Largeur mobile (< 768px), le `@media` étant le point le plus fragile

## Ce que cette étape ne fait pas

Le **registre d'activités** est l'étape 4. Ici, `room.component` référence encore
directement le composant poker : aucun chargement dynamique, aucune résolution par
type. L'objectif est seulement de rendre la frontière nette pour que le registre
n'ait plus qu'à la franchir.
