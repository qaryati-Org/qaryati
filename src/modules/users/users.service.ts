import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Role } from '../auth/enums/role.enum';
import { User } from './entities/user.entity';

const UNIQUE_VIOLATION = '23505';

export interface CreateUserInput {
  email: string;
  // Already hashed by the caller (auth); this service never sees plain text.
  passwordHash: string;
  displayName: string;
  role?: Role;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Used by the auth module (register, login, token checks). Returns entities
// because it is internal; controllers map them with UserResponseDto.
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  // withPassword is only for login, which has to compare the hash.
  findByEmail(email: string, withPassword = false): Promise<User | null> {
    const qb = this.users
      .createQueryBuilder('u')
      .where('u.email = :email', { email: normalizeEmail(email) });
    if (withPassword) qb.addSelect('u.passwordHash');
    return qb.getOne();
  }

  async create(input: CreateUserInput): Promise<User> {
    const user = this.users.create({
      email: normalizeEmail(input.email),
      passwordHash: input.passwordHash,
      displayName: input.displayName.trim(),
      role: input.role ?? Role.VIEWER,
    });
    try {
      return await this.users.save(user);
    } catch (err) {
      // Rely on the unique constraint instead of a pre-check, so two
      // concurrent registrations with the same email cannot both succeed.
      if (
        err instanceof QueryFailedError &&
        (err.driverError as { code?: string }).code === UNIQUE_VIOLATION
      ) {
        throw new ConflictException('A user with this email already exists');
      }
      throw err;
    }
  }
}
