import {
  ConflictException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { GEOCODING_PROVIDER } from '../geocoding/interfaces/geocoding.tokens';
import type { GeocodingProvider } from '../geocoding/interfaces/geocoding-provider.interface';
import { NearbyVillagesQueryDto } from './dto/nearby-villages-query.dto';
import {
  NearbyVillageResponseDto,
  NearbyVillagesResponseDto,
} from './dto/nearby-village-response.dto';
import { VillageResponseDto } from '../village/dto/village-response.dto';
import { Village } from '../village/entities/village.entity';
import { VillageService } from '../village/village.service';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

const HAVERSINE_DISTANCE_KM = `
  2 * 6371 * ASIN(
    SQRT(
      LEAST(
        1.0,
        GREATEST(
          0.0,
          POWER(SIN(RADIANS(v.latitude - :originLatitude) / 2), 2)
          + COS(RADIANS(:originLatitude)) * COS(RADIANS(v.latitude))
          * POWER(SIN(RADIANS(v.longitude - :originLongitude) / 2), 2)
        )
      )
    )
  )
`;

interface NearbyVillageRow {
  id: string;
  nameAr: string;
  nameEn: string | null;
  latitude: number;
  longitude: number;
  distanceKm: number | string;
}

@Injectable()
export class GeographyService {
  constructor(
    private readonly villageService: VillageService,
    @Inject(GEOCODING_PROVIDER)
    private readonly geocodingProvider: GeocodingProvider,
    @InjectRepository(Village)
    private readonly villages: Repository<Village>,
  ) {}

  async geocodeVillage(id: string): Promise<VillageResponseDto> {
    const village = await this.villageService.findOne(id);

    if (village.latitude !== null || village.longitude !== null) {
      throw new ConflictException(`Village ${id} already has coordinates`);
    }

    const address = `${village.nameEn ?? village.nameAr}, ${village.governorate.nameEn}, Palestine`;
    const result = await this.geocodingProvider.geocode(address);

    if (result === null) {
      throw new UnprocessableEntityException(
        `No location could be resolved for village ${id}`,
      );
    }

    const updateResult = await this.villages.update(
      { id, latitude: IsNull(), longitude: IsNull() },
      { latitude: result.latitude, longitude: result.longitude },
    );

    if (updateResult.affected !== 1) {
      throw new ConflictException(
        `Village ${id} coordinates changed while geocoding`,
      );
    }

    return this.villageService.findOne(id);
  }

  async findNearbyVillages(
    id: string,
    query: NearbyVillagesQueryDto,
  ): Promise<NearbyVillagesResponseDto> {
    const referenceVillage = await this.villageService.findOne(id);

    if (
      referenceVillage.latitude === null ||
      referenceVillage.longitude === null
    ) {
      throw new UnprocessableEntityException(
        `Village ${id} does not have stored coordinates`,
      );
    }

    const rows = await this.villages
      .createQueryBuilder('v')
      .select('v.id', 'id')
      .addSelect('v.nameAr', 'nameAr')
      .addSelect('v.nameEn', 'nameEn')
      .addSelect('v.latitude', 'latitude')
      .addSelect('v.longitude', 'longitude')
      .addSelect(HAVERSINE_DISTANCE_KM, 'distanceKm')
      .where('v.id <> :referenceVillageId')
      .andWhere('v.latitude IS NOT NULL')
      .andWhere('v.longitude IS NOT NULL')
      .andWhere(`${HAVERSINE_DISTANCE_KM} <= :radius`)
      .orderBy(HAVERSINE_DISTANCE_KM, 'ASC')
      .addOrderBy('v.id', 'ASC')
      .setParameters({
        referenceVillageId: id,
        originLatitude: referenceVillage.latitude,
        originLongitude: referenceVillage.longitude,
        radius: query.radius,
      })
      .getRawMany<NearbyVillageRow>();

    return {
      data: rows.map((row): NearbyVillageResponseDto => ({
        id: row.id,
        nameAr: row.nameAr,
        nameEn: row.nameEn,
        latitude: row.latitude,
        longitude: row.longitude,
        distanceKm: Number(row.distanceKm),
      })),
    };
  }
}
