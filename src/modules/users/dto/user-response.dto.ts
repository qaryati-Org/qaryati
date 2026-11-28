import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../auth/enums/role.enum';
import { User } from '../entities/user.entity';

// Public view of a user: never includes the password hash.
export class UserResponseDto {
  @ApiProperty({ example: '32556933-5931-450b-bdf2-721cea0b9744' }) id!: string;
  @ApiProperty({ example: 'lina@example.com' }) email!: string;
  @ApiProperty({ example: 'Lina' }) displayName!: string;
  @ApiProperty({ enum: Role, example: Role.VIEWER }) role!: Role;
  @ApiProperty({ example: true }) isActive!: boolean;
  @ApiProperty({ example: '2026-11-28T18:04:15.944Z' })
  createdAt!: Date;

  static from(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
    };
  }
}
