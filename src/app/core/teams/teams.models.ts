/** Team-scoped roles. NOT to be confused with the room's `facilitator`, who runs
 * the current round — any member can hold that, and it is handed over in session. */
export type TeamRole = 'owner' | 'manager' | 'member';

export interface Team {
  id: number;
  name: string;
  owner_email: string;
  created_at: string;
  my_role: TeamRole;
  member_count: number;
  card_back_color: string;
  felt_color: string;
  deck_ids: number[];
  card_back_id: number | null;
  card_back_style: SurfaceStyle;
  felt_style: SurfaceStyle;
  felt_id: number | null;
  background_style: BackgroundStyle;
  background_color: string;
  background_id: number | null;
  result_layout: ResultLayout;
  is_paid: boolean;
  billing_enabled: boolean;
  subscription_status: string;
}

export interface Membership {
  id: number;
  user: { id: number; email: string; display_name: string; avatar_url: string };
  role: TeamRole;
  joined_at: string;
}

export interface Invitation {
  id: number;
  email: string;
  role: TeamRole;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

export interface DeckCardPreview {
  value: string;
  slug: string;
  order: number;
  image: string;
}

export interface Deck {
  id: number;
  name: string;
  vote_type_code: string;
  vote_type_name: string;
  is_standard: boolean;
  is_custom: boolean;
  card_back_image: string;
  cards: DeckCardPreview[];
}

/** Which representation a surface renders. */
export type SurfaceStyle = 'color' | 'image';
/** Le fond a un etat de plus que les autres surfaces : 'theme' n'impose rien et
 * laisse la page suivre le mode clair/sombre du visiteur. C'est le defaut. */
export type BackgroundStyle = 'theme' | 'color' | 'image';
/** Les deux formes du depouillement, une fois les votes reveles. Meme type que dans
 * le protocole temps reel : c'est la meme valeur, reglee ici et figee sur la salle. */
export type ResultLayout = 'cards' | 'summary';

export interface Felt {
  id: number;
  name: string;
  is_standard: boolean;
  is_custom: boolean;
  image: string;
}

export interface Background {
  id: number;
  name: string;
  is_standard: boolean;
  is_custom: boolean;
  image: string;
}

export interface CardBack {
  id: number;
  name: string;
  is_standard: boolean;
  is_custom: boolean;
  image: string;
}

export interface TeamDecks {
  decks: Deck[];
  selected_deck_ids: number[];
  card_backs: CardBack[];
  selected_card_back_id: number | null;
  felts: Felt[];
  selected_felt_id: number | null;
  backgrounds: Background[];
  selected_background_id: number | null;
  can_customize: boolean;
}
