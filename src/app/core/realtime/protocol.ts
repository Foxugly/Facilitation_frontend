// WebSocket protocol types (delegation-poker-realtime-contract.md).
export const PROTOCOL_VERSION = 1;

export type RoundState = 'idle' | 'open' | 'revealed' | 'acted';
export type Role = 'facilitator' | 'voter';

export interface Envelope<T = unknown> {
  v: number;
  type: string;
  payload: T;
  cid?: string;
  ts?: number;
}

export interface TextLayer {
  /** `icon` porte une cle du registre de pictogrammes ; son `text` est toujours une
   * chaine, jamais un dictionnaire par langue (une cle d'icone ne se traduit pas). */
  kind: 'static' | 'i18n' | 'icon';
  order: number;
  x: number;
  y: number;
  font: string;
  size: number;
  weight: number;
  color: string;
  align: 'left' | 'center' | 'right';
  text: string | Record<string, string>;
  /** URL du pictogramme d'une couche `icon` ; null sur une couche de texte. Le
   * referentiel le porte comme donnee : en ajouter un est un televersement. */
  icon: string | null;
}

export interface SnapshotCard {
  value: string;
  slug: string;
  order: number;
  background: { image: string | null };
  layers: TextLayer[];
}

/** How a surface is rendered. Both representations are always carried, so a team
 * switching style needs no new room; `style` alone decides which one to draw. */
export interface Surface {
  style: 'color' | 'image';
  image: string | null;
  color: string;
}

/** Le fond de la page de salle. 'theme' n'est ni une couleur ni une image : le
 * client ne peint rien et laisse la page suivre le mode clair/sombre. Absent des
 * salles creees avant la fonctionnalite, d'ou l'optionnalite ci-dessous. */
export interface BackgroundSurface {
  style: 'theme' | 'color' | 'image';
  image: string | null;
  color: string;
}

export interface DeckSnapshot {
  voteType: string;
  resolutionStrategy: string;
  deckId: number;
  cardBack: Surface;
  felt: Surface;
  background?: BackgroundSurface;
  /** Legacy, pre-Surface. Kept only until every deployed client reads the above. */
  theme?: { cardBackColor: string; feltColor: string };
  cards: SnapshotCard[];
}

export interface ParticipantView {
  participantId: string;
  username: string;
  role: Role;
  hasVoted: boolean;
}

/** Per-value vote count. Always emitted, in both reveal modes. */
export interface VoteTally {
  cardValue: string;
  count: number;
}

/** Who voted what. Emitted ONLY for a nominative round — an anonymous one omits
 * the key entirely rather than expecting the client to hide it. */
export interface NominativeVote {
  participantId: string;
  cardValue: string;
}

/** Reveal mode of the current round, announced to every participant (not just the
 * facilitator) so a voter knows whether their card will carry their name. */
export interface RevealMode {
  anonymous: boolean;
  canAnonymise: boolean;
}

/** Un item du round (design N-items, §5). Le poker d'aujourd'hui n'en joue
 * jamais qu'un seul par round, mais la forme est deja celle qui portera les
 * futures activites — ne pas la confondre avec `ItemResult`, leur depouillement. */
export interface RoundItem {
  id: number;
  text: string;
  sequence: number;
}

/** Le payload d'une reponse a un item : sa forme depend du schema que declare
 * l'activite au registre. Le poker n'en connait qu'une, `{ card }`. */
export interface CardResponsePayload {
  card: string;
}

/** Mes reponses au round courant, indexees par id d'item (cle string cote
 * JSON, `state.sync.myResponses`). Remplace `StateSync.myVote`, qui ne portait
 * la reponse que pour un seul item implicite. */
export type MyResponses = Record<string, CardResponsePayload>;

/** Le depouillement d'UN item — un bloc par item dans `vote.revealed.itemResults`.
 * `votes` est absent des blocs d'un round anonyme : invariant serveur (le lien
 * participant -> carte n'est jamais envoye), jamais un masquage cote client. */
export interface ItemResult {
  itemId: number;
  tally: VoteTally[];
  spread: { min: number | null; max: number | null };
  votes?: NominativeVote[];
}

/** Payload de `vote.revealed` (contrat §8.2.b). `itemResults` porte tout ; les
 * cles plates ci-dessous sont l'ancien alias : le serveur ne les emet plus du
 * tout depuis la bascule de ce front sur `itemResults` — optionnelles pour ne
 * pas mentir sur ce qu'un payload reel porte encore. A ne plus lire. */
export interface RevealedPayload {
  itemResults: ItemResult[];
  anonymous: boolean;
  reason?: 'timeout' | 'facilitator';
  /** @deprecated Remplace par `itemResults[].tally`. */
  tally?: VoteTally[];
  /** @deprecated Remplace par `itemResults[].votes`. */
  votes?: NominativeVote[];
  /** @deprecated Remplace par `itemResults[].spread`. */
  spread?: { min: number | null; max: number | null };
}

/** One line of the facilitator's scenario (agenda): a subject with its round status. */
export interface AgendaItem {
  id: number;
  text: string;
  status: 'current' | 'done' | 'pending';
  result: string | null;
  /** L'etat REEL du round (tache 5d, tache 4 complement) — coexiste avec `status`
   * a dessein : `status` repond a « ou en est-on dans la seance ? » (courant /
   * acte / en attente), `state` a « ce round a-t-il deja vecu ? ». Necessaire
   * pour distinguer un round jamais ouvert (`idle`) d'un round ouvert puis
   * abandonne sans resultat (`open`/`revealed`) — les deux sont `status:
   * 'pending'`, mais seul le premier est retirable (`services.py::remove_round`). */
  state: RoundState;
  /** Vrai si ce round a deja porte une decision, UNE FOIS, a n'importe quel
   * moment -- independamment de son etat courant (tache 5d, 2e complement).
   * `vote.reset` vide les reponses et remet le round a `idle` mais NE REECRIT
   * PAS l'historique : un round acte puis reinitialise redevient `status:
   * 'pending'` / `state: 'idle'`, un round prepare ordinaire en apparence,
   * alors que le serveur refuse toujours son retrait (`results.exists()`,
   * `services.py::remove_round`). Sans cette cle, rien dans l'agenda ne
   * distinguait ce cas d'un round jamais joue. */
  everDecided: boolean;
  /** Quatrieme question, independante des trois precedentes (round de
   * correction 1, contrat) : si CE round sert un jour de source a un
   * chainage `top N` (§8.5), le serveur honorera-t-il un `top` non nul, ou
   * refusera-t-il systematiquement (`bind_round`) ? Vient du registre
   * serveur (`ActivitySpec.rank_value`) — un consensus par item n'est pas un
   * ordre ENTRE items, donc aucune activite actuelle ne classe, et `canRank`
   * vaut `false` partout aujourd'hui. A LIRE ICI plutot qu'a deviner : le
   * champ « top N » ne doit s'afficher QUE si la source choisie le declare,
   * pour ne jamais offrir un geste que le serveur refuse toujours. */
  canRank: boolean;
  /** Les items de CE round (design N-items, §5) — un round sans round associe
   * n'apparait pas dans l'agenda, donc toujours au moins un item ici. */
  items: RoundItem[];
}

/** Facilitator-controlled round timer (contract §timer): purely advisory to the UI —
 * the server alone decides when a deadline actually causes a reveal. */
export interface TimerSettings {
  enabled: boolean;
  seconds: number;
}

/** Les deux formes que peut prendre le depouillement (reglage d'equipe). */
export type ResultLayout = 'cards' | 'summary';

/** A room's frozen deck catalogue entry — enough to pick, without the cards. */
export interface AvailableDeck {
  deckId: number;
  voteType: string;
  cardBack: { image: string | null };
}

/** Payload de l'intention `round.configure` (contrat SS8.3, design 5c) : fige
 * le deck et/ou la config d'un round DEJA PREPARE, avant son ouverture. Les
 * deux cles sont facultatives — changer de deck sans configurer, et
 * configurer sans changer de deck, sont deux usages valides. Remplace
 * `round.prepare` pour ce cas precis : ce dernier recompose le round (sujet,
 * agenda...) et applique aussi le deck au niveau de la ROOM, donc a tous les
 * rounds a venir qui n'en choisiraient pas un explicitement. */
export interface RoundConfigurePayload {
  roundId: number;
  deckId?: number;
  config?: Record<string, unknown>;
}

/** Le fait rediffuse en reponse a `round.configure` (contrat SS8.3), a tous.
 * `deck.changed` est AUSSI diffuse par le serveur, mais seulement si le deck a
 * reellement change — c'est lui qui met a jour `deckSnapshot` cote client ;
 * ne pas dupliquer cette logique ici. */
export interface RoundConfiguredPayload {
  roundId: number;
  deckSnapshot: DeckSnapshot;
  config: Record<string, unknown>;
}

/** La regle d'une liaison de chainage (contrat §8.5, design §7) : ce que reprend
 * un round de son round source. Les TROIS cles sont toujours presentes cote
 * serveur (`_validate_chaining_rule` exige EXACTEMENT {take, mode, top}) — `top`
 * vaut `null` quand il ne s'applique pas, jamais absent. */
export interface ChainRule {
  take: 'items' | 'results';
  mode: 'auto' | 'manual';
  top: number | null;
}

/** Un candidat de chainage presente au facilitateur en mode manuel
 * (`round.candidates`, contrat §8.5.a). `sourceItemId` designe un item DE LA
 * SOURCE — a ne jamais confondre avec `itemId`, qui designe un item du round
 * qu'on regarde (piege deja rencontre cote serveur, task-2-report.md).
 * `authorId` est l'UUID PUBLIC du participant (`Participant.public_id`,
 * round de correction 1) — meme convention que `ParticipantView.participantId`
 * (§5), jamais la PK interne : comparable tel quel a la liste des
 * participants. `null` sans auteur (pose par le facilitateur, ou auteur
 * ayant quitte la salle). */
export interface ChainCandidate {
  sourceItemId: number;
  text: string;
  authorId: string | null;
}

/** Un item copie par chainage (`round.resolved`, contrat §8.5). `originItemId`
 * remonte a la RACINE de la chaine entiere ; `sourceItemId` designe son parent
 * DIRECT dans CETTE resolution. Les deux coexistent : sur une chaine de plus
 * d'un maillon, aucun des deux ne remplace l'autre. `authorId` : voir
 * `ChainCandidate.authorId` ci-dessus, meme convention (UUID public). */
export interface ChainedItem {
  itemId: number;
  text: string;
  sequence: number;
  originItemId: number | null;
  sourceItemId: number | null;
  authorId: string | null;
}

/** Le fait rediffuse en reponse a `round.bind` (contrat §8.5), a tous — la
 * liaison ne change ni les items ni l'etat d'aucun round, aucun autre fait
 * n'est donc necessaire. */
export interface RoundBoundPayload {
  roundId: number;
  sourceRoundId: number;
  rule: ChainRule;
}

/** Le fait envoye AU SEUL facilitateur (`round.candidates`, contrat §8.5.a)
 * quand un round lie en mode manuel, pas encore resolu, devient courant. */
export interface RoundCandidatesPayload {
  roundId: number;
  candidates: ChainCandidate[];
}

/** Le fait rediffuse en reponse a `round.resolve` (contrat §8.5), a tous. */
export interface RoundResolvedPayload {
  roundId: number;
  items: ChainedItem[];
}

export interface StateSync {
  room: { code: string; title: string; isTeam?: boolean };
  protocolVersion: number;
  roundState: RoundState;
  subject: string;
  deckSnapshot: DeckSnapshot;
  availableDecks: AvailableDeck[];
  participants: ParticipantView[];
  /** Le role du destinataire, tel que le serveur le voit. Fait autorite : le client
   * le tenait de sa session enregistree a l'arrivee, donc figee. */
  myRole?: Role;
  /** Pour que le client se reconnaisse dans les diffusions, qui designent le nouveau
   * facilitateur par son identifiant public. */
  myParticipantId?: string;
  /** Comment le depouillement occupe la place de la main une fois les votes reveles :
   * les cartes jouees, ou des lignes chiffrees. Fige sur la salle a sa creation depuis
   * le reglage de l'equipe ; absent des vieux serveurs, d'ou le defaut cote client. */
  resultLayout?: ResultLayout;
  /** @deprecated Remplace par `myResponses` — ne portait la reponse que pour
   * un seul item implicite (contrat §8.2.b). Le serveur ne l'emet plus du
   * tout ; optionnel pour ne pas mentir sur un payload reel. */
  myVote?: string | null;
  /** Mes reponses au round courant, indexees par id d'item. */
  myResponses: MyResponses;
  /** Les items du round courant (design N-items, §5). A NE PAS CONFONDRE avec
   * `itemResults` (leur depouillement, forme differente). */
  items: RoundItem[];
  /** Le depouillement, un bloc par item — present si le round courant est
   * revele ou acte (repris depuis `vote.revealed`, meme mecanique que les
   * cles plates depreciees ci-dessous), absent sur un round idle/open : rien
   * n'a encore ete depouille. */
  itemResults?: ItemResult[];
  result: string | null;
  facilitatorPresent: boolean;
  agenda: AgendaItem[];
  /** @deprecated Remplace par `itemResults[0].tally` — encore fusionne ici pour
   * un arrivant sur un round revele, le temps que `state.sync` porte lui aussi
   * `itemResults` (contrat §8.2.b). */
  tally?: VoteTally[];
  /** @deprecated Voir `tally`. */
  votes?: NominativeVote[];
  /** Present sur un round revele ou acte, comme dans `vote.revealed` — sans quoi
   * l'ecart disparaissait de l'ecran au moindre rechargement.
   * @deprecated Voir `tally`. */
  spread?: { min: number | null; max: number | null };
  reveal: RevealMode;
  deadline: string | null;
  timer: TimerSettings;
  /** Les candidats du round courant, si lie en mode manuel et pas encore resolu
   * (contrat §8.5.a, §5.1) — UNIQUEMENT presente si le destinataire de ce
   * snapshot est le facilitateur. Absente (pas vide) pour tout autre
   * destinataire ou toute autre situation : la garde precede le calcul, jamais
   * un masquage cote client. Meme forme que le `candidates` de
   * `round.candidates`, sans le `roundId` (implicitement le round courant). */
  chainingCandidates?: ChainCandidate[];
}

export interface Participation {
  voted: number;
  total: number;
  votedIds: string[];
}

export interface RoomError {
  code: string;
  message: string;
  rejectedType: string;
  cid: string | null;
}
