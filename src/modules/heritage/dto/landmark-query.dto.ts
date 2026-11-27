import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';
import { VerificationStatus } from '../../source';
import { LandmarkType } from '../entities/landmark.entity';

export class LandmarkQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: VerificationStatus,
    default: VerificationStatus.VERIFIED,
  })
  @IsOptional()
  @IsEnum(VerificationStatus)
  status?: VerificationStatus;

  @ApiPropertyOptional({ enum: LandmarkType })
  @IsOptional()
  @IsEnum(LandmarkType)
  type?: LandmarkType;

  @ApiPropertyOptional({ enum: ['name'], default: 'name' })
  @IsOptional()
  @IsIn(['name'])
  declare sort?: 'name';

  @ApiPropertyOptional({ enum: ['asc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc'])
  declare order: 'asc';
}
