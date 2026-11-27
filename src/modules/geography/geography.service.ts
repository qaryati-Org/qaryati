import {
  ConflictException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { GEOCODING_PROVIDER } from '../geocoding/interfaces/geocoding.tokens';
import type { GeocodingProvider } from '../geocoding/interfaces/geocoding-provider.interface';
import { VillageResponseDto } from '../village/dto/village-response.dto';
import { VillageService } from '../village/village.service';

@Injectable()
export class GeographyService {
  constructor(
    private readonly villageService: VillageService,
    @Inject(GEOCODING_PROVIDER)
    private readonly geocodingProvider: GeocodingProvider,
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

    return this.villageService.update(id, {
      latitude: result.latitude,
      longitude: result.longitude,
    });
  }
}
