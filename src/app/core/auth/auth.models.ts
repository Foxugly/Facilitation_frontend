export interface AuthUser {
  id: number;
  email: string;
  display_name: string;
  avatar_url: string;
  email_confirmed: boolean;
  is_staff: boolean;
  is_superuser: boolean;
  subscription_bypass: boolean;
}

export interface TokenPair {
  access: string;
  refresh: string;
  user: AuthUser;
}
