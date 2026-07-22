import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordPolicyService } from './password-policy.service';
import { PasswordHasher } from './password-hasher';
import { VerificationTokenService } from './verification-token.service';
import { UsersRepository } from './users.repository';
import { ListsRepository } from './lists.repository';
import { EmailOutboxRepository } from './email-outbox.repository';

// Auth capability module (FR-AUTH-*). FEAT-001 wires registration; later auth
// slices (verify, sign-in, reset, change password) add to it. The controller is
// registered in T7. DbService comes from the global InfraModule.
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordPolicyService,
    PasswordHasher,
    VerificationTokenService,
    UsersRepository,
    ListsRepository,
    EmailOutboxRepository,
  ],
})
export class AuthModule {}
