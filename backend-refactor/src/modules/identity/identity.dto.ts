import type { IdentityUserRecord } from './ports/user.repository.js';

export interface IdentityUserDto {
  id: string;
  email: string;
  display_name: string;
  role: string;
  is_guest: boolean;
}

export function toIdentityUserDto(user: IdentityUserRecord): IdentityUserDto {
  return {
    id: user.id,
    email: user.email,
    display_name: user.displayName,
    role: user.role,
    is_guest: user.isGuest,
  };
}
