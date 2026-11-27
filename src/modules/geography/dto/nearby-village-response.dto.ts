import { ApiProperty } from '@nestjs/swagger';

export class NearbyVillageResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  nameAr!: string;

  @ApiProperty({ nullable: true, type: String })
  nameEn!: string | null;

  @ApiProperty({ minimum: -90, maximum: 90 })
  latitude!: number;

  @ApiProperty({ minimum: -180, maximum: 180 })
  longitude!: number;

  @ApiProperty({
    minimum: 0,
    description: 'Distance from the reference village in kilometers',
  })
  distanceKm!: number;
}

export class NearbyVillagesResponseDto {
  @ApiProperty({ type: [NearbyVillageResponseDto] })
  data!: NearbyVillageResponseDto[];
}
