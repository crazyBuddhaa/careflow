import { UserRole } from '@careflow/shared';

export interface AuthSessionIdentity {
  userId: string;
  email?: string;
  organizationId: string;
  role: UserRole;
}

export interface AuthenticationPort {
  resolveSession(): Promise<AuthSessionIdentity | null>;
  signOut(): Promise<void>;
}

const ROLE_WEIGHT: Record<UserRole, number> = {
  [UserRole.Customer]: 10,
  [UserRole.Agent]: 20,
  [UserRole.Supervisor]: 30,
  [UserRole.Admin]: 40,
  [UserRole.Owner]: 50,
};

/**
 * Pure role-based authorization helper kept separate from UI components and HTTP transport.
 */
export function hasMinimumRole(identity: AuthSessionIdentity | null, requiredRole: UserRole): boolean {
  if (!identity) {
    return false;
  }
  return ROLE_WEIGHT[identity.role] >= ROLE_WEIGHT[requiredRole];
}
