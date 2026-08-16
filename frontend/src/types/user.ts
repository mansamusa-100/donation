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
  /** True only for the OWNER_EMAIL account — can promote/demote admins. */
  isPlatformOwner?: boolean;
  /** Organizer identity verification status (government ID). */
  kycStatus?: 'Unverified' | 'Pending' | 'Verified' | 'Rejected';
  hasKycDocument?: boolean;
  /** Own document path (not publicly accessible). */
  kycDocumentUrl?: string | null;
  kycSubmittedAt?: string | null;
  kycReviewedAt?: string | null;
  /** Present when KYC was rejected (organizer-facing reason). */
  kycNotes?: string | null;
}
