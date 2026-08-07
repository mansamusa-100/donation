export interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'ADMIN' | 'USER';
  phoneNumber?: string | null;
  avatarUrl?: string | null;
  isActive?: boolean;
  createdAt?: string;
  /** False until the user confirms email (Google accounts are verified). */
  emailVerified?: boolean;
  adminPanelPermissions?: string[];
}
