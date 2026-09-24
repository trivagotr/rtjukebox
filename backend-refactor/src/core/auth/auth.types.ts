export interface AuthPrincipal {
  userId: string;
  roles: readonly string[];
}

export type Role = string;
