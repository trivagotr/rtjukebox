import type { IdentityUserRecord } from './ports/user.repository.js';

export interface IdentityUserDto {
  id: string;
  email: string;
}

export function toIdentityUserDto(user: IdentityUserRecord): IdentityUserDto {
  return {
    id: user.id,
    email: user.email,
  };
}
