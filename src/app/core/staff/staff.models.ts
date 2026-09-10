export interface StaffUser {
  id: number;
  email: string;
  display_name: string;
  subscription_bypass: boolean;
  bypass_note: string;
  bypass_granted_at: string | null;
}
