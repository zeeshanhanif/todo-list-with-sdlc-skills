import { Injectable } from '@nestjs/common';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@todo/shared';
import { COMMON_PASSWORDS } from './common-passwords';

/**
 * Enforces the password policy (FR-AUTH-004, NFR-SEC-003, technical-design D2):
 * length bounds plus rejection of common/breached passwords (case-insensitive,
 * offline). `check` returns null when acceptable, or the specific requirement
 * message to surface to the user (UC-001 alt 3b).
 */
@Injectable()
export class PasswordPolicyService {
  private readonly common: Set<string> = new Set(
    COMMON_PASSWORDS.map((p) => p.toLowerCase()),
  );

  check(password: string): string | null {
    if (password.length < PASSWORD_MIN_LENGTH) {
      return `Must be at least ${PASSWORD_MIN_LENGTH} characters.`;
    }
    if (password.length > PASSWORD_MAX_LENGTH) {
      return `Must be at most ${PASSWORD_MAX_LENGTH} characters.`;
    }
    if (this.common.has(password.toLowerCase())) {
      return 'This password is too common — pick another.';
    }
    return null;
  }
}
