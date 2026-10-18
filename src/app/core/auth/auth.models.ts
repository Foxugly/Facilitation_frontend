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

/** Login / magic-link / email-confirm response. In cookie mode (the SPA) the
 * refresh token is in the HttpOnly cookie and absent from the body. */
export interface TokenPair {
  access: string;
  refresh?: string;
  user: AuthUser;
}
