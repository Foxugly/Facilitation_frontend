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

/** One line of the facilitator's scenario (agenda): a subject with its round status. */
export interface AgendaItem {
  id: number;
  text: string;
  status: 'current' | 'done' | 'pending';
  result: string | null;
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
  myVote: string | null;
  result: string | null;
  facilitatorPresent: boolean;
  agenda: AgendaItem[];
  tally?: VoteTally[];
  votes?: NominativeVote[];
  /** Present sur un round revele ou acte, comme dans `vote.revealed` — sans quoi
   * l'ecart disparaissait de l'ecran au moindre rechargement. */
  spread?: { min: number | null; max: number | null };
  reveal: RevealMode;
  deadline: string | null;
  timer: TimerSettings;
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
