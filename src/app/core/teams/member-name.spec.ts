import { describe, expect, it } from 'vitest';

import { memberName } from './member-name';

const user = (display_name: string, email: string | null) => ({ id: 7, display_name, email, avatar_url: '' });

describe('memberName', () => {
  it('prefers the display name, even when the e-mail is visible', () => {
    expect(memberName(user('Alice', 'alice@example.com'), 'Member 1')).toBe('Alice');
  });

  it('shows the e-mail to a manager when the teammate has no name', () => {
    expect(memberName(user('', 'bob@example.com'), 'Member 2')).toBe('bob@example.com');
  });

  it('falls back to the neutral label for a member, with no trace of the e-mail', () => {
    expect(memberName(user('  ', null), 'Member 3')).toBe('Member 3');
  });
});
