import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class RejectCulturalTraitDto {
  @ApiProperty({
    maxLength: 1000,
    description: 'Required explanation for rejecting the cultural trait.',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, {
    message: 'reviewNote must contain a non-whitespace character',
  })
  @MaxLength(1000)
  reviewNote!: string;
}
