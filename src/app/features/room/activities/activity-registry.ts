import { Type } from '@angular/core';

import { RoundState } from '../../../core/realtime/protocol';

import { DelegationPokerFacilitatorPanelComponent } from './delegation-poker/facilitator-panel.component';
import { DelegationPokerTableComponent } from './delegation-poker/table.component';

/**
 * Registre des activites d'une salle.
 *
 * Objectif structurant du plan : **ajouter une activite ne doit toucher que ce
 * fichier**. La salle ne connait plus aucune activite par son nom — elle demande
 * au registre quels composants rendre pour le `voteType` en cours.
 *
 * Chaque entree declare deux composants distincts plutot qu'un seul pilote par
 * des `computed` de role :
 *
 * - `board` : ce que voient TOUS les participants (sujet, etat, votes, resultat) ;
 * - `panel` : les commandes du facilitateur, rendues a lui seul.
 *
 * Les deux injectent `RoomSocketService` directement : le registre n'a donc aucun
 * etat a leur transmettre, il ne fait que designer des classes.
 *
 * Ce que ce registre ne fait PAS encore (etapes suivantes du plan) : declarer le
 * schema de configuration, celui du payload de reponse, l'agregateur
 * Responses -> Results, ni les etats du cycle que l'activite utilise. Il se limite
 * a la resolution des composants — la frontiere que les etapes 3a a 3c ont rendue
 * nette.
 */
export interface ActivityDefinition {
  /** Ce que voient tous les participants. */
  board: Type<unknown>;
  /** Les commandes, rendues au seul facilitateur. */
  panel: Type<unknown>;

  /**
   * Les etats du cycle que cette activite emprunte reellement.
   *
   * Le cycle complet vise par le plan est
   * `DRAFT -> READY -> OPEN -> CLOSED -> REVEALED -> COMPLETED`, mais toutes les
   * activites n'en ont pas l'usage : un brainstorming s'arrete a CLOSED, il n'a
   * rien a reveler. Le poker, lui, tourne sur le cycle historique
   * `idle -> open -> revealed -> acted`, sans CLOSED.
   *
   * Declarer la liste ici plutot que de la deduire evite au shell de supposer un
   * cycle universel — c'est la premiere marche vers l'introduction de CLOSED pour
   * les seules activites qui en auront besoin, sans toucher au poker.
   */
  states: readonly RoundState[];

  /**
   * Ce que l'activite consomme et produit.
   *
   * `consumes` dit d'ou viennent ses items : d'une saisie libre du facilitateur,
   * ou des resultats d'un round precedent (le chainage, differenciateur produit).
   * `produces` dit si elle laisse un resultat exploitable par la suivante.
   *
   * Le poker consomme des sujets saisis et produit un niveau retenu, donc il peut
   * alimenter une autre activite. Un brainstorming produirait des items sans
   * consommer de resultat.
   */
  consumes: 'subjects' | 'results' | 'none';
  produces: 'results' | 'items' | 'none';

  /**
   * Options reservees aux equipes payantes que l'activite expose.
   *
   * Le shell n'a pas a savoir qu'un timer existe : il demande au registre ce que
   * l'activite propose. Une activite sans notion de duree ne declarera pas
   * `timer`, et le reglage disparaitra de lui-meme.
   */
  teamOptions: readonly ('timer' | 'anonymous' | 'deck')[];
}

/**
 * Clef = le `voteType` porte par le snapshot de deck, cote serveur
 * (`decks.VoteType.code`). C'est le serveur qui decide de l'activite jouee ; le
 * front ne fait que resoudre son rendu.
 */
export const ACTIVITY_REGISTRY: Readonly<Record<string, ActivityDefinition>> = {
  delegation_poker: {
    board: DelegationPokerTableComponent,
    panel: DelegationPokerFacilitatorPanelComponent,
    // Cycle historique, sans CLOSED : les votes se revelent directement.
    states: ['idle', 'open', 'revealed', 'acted'],
    // Consomme des sujets saisis (ou pris dans l'agenda), produit un niveau
    // retenu — donc chainable vers une activite qui consommerait des resultats.
    consumes: 'subjects',
    produces: 'results',
    teamOptions: ['timer', 'anonymous', 'deck'],
  },
};

/**
 * L'activite a rendre, ou celle par defaut.
 *
 * Le repli sur `delegation_poker` est deliberé : un deck dont le `voteType` n'a
 * pas encore de rendu (un type ajoute cote serveur avant que le front ne suive)
 * doit afficher QUELQUE CHOSE plutot qu'une salle vide. La salle reste jouable,
 * au prix d'un rendu inadapte — ce qui se remarque, la ou une page blanche
 * laisserait croire a une panne.
 */
export function resolveActivity(voteType: string | undefined | null): ActivityDefinition {
  return (voteType && ACTIVITY_REGISTRY[voteType]) || ACTIVITY_REGISTRY['delegation_poker'];
}
