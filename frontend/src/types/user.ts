export interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'ADMIN' | 'USER';
  phoneNumber?: string | null;
  isActive?: boolean;
  createdAt?: string;
  adminPanelPermissions?: string[];
}
