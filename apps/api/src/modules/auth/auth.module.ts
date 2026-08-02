import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordPolicyService } from './password-policy.service';
import { PasswordHasher } from '../../common/crypto/password-hasher';
import { VerificationTokenService } from './verification-token.service';
import { ResetTokenService } from './reset-token.service';
import { UsersRepository } from './users.repository';
import { ListsRepository } from './lists.repository';
import { EmailOutboxRepository } from './email-outbox.repository';
import { SessionService } from '../../common/authz/session.service';
import { SessionsRepository } from '../../common/authz/sessions.repository';
import { SessionGuard } from '../../common/authz/session.guard';
import { AuditService } from '../../common/audit/audit.service';
import { AuditRepository } from '../../common/audit/audit.repository';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';
import { RateLimitRepository } from '../../common/rate-limit/rate-limit.repository';

// Auth capability module (FR-AUTH-*). FEAT-001 wires registration; later auth
// slices (verify, sign-in, reset, change password) add to it. FEAT-003 (sign in)
// pulls in the cross-cutting session store + audit log from common/*. DbService
// comes from the global InfraModule.
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordPolicyService,
    PasswordHasher,
    VerificationTokenService,
    ResetTokenService,
    UsersRepository,
    ListsRepository,
    EmailOutboxRepository,
    SessionService,
    SessionsRepository,
    SessionGuard,
    AuditService,
    AuditRepository,
    RateLimitGuard,
    RateLimitRepository,
  ],
})
export class AuthModule {}
