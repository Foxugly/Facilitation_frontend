import { Membership } from './teams.models';

/**
 * Name shown for a teammate. The server sends `email` only to the team's managers
 * (and for one's own row): a plain member sees names, never addresses. Without a
 * profile name, fall back to the neutral, caller-supplied label ("Member 3") —
 * never to a fragment of the e-mail.
 */
export function memberName(user: Membership['user'], fallback: string): string {
  return user.display_name?.trim() || user.email || fallback;
}
