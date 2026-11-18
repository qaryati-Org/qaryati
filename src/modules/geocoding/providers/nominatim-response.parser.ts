import { Injectable } from '@nestjs/common';
import { GeocodingResult } from '../interfaces/geocoding-provider.interface';

@Injectable()
export class NominatimResponseParser {
  parse(data: unknown): GeocodingResult | null {
    if (!Array.isArray(data)) {
      throw new Error('Invalid Nominatim response: expected an array');
    }

    if (data.length === 0) {
      return null;
    }

    const result: unknown = data[0];

    if (typeof result !== 'object' || result === null) {
      throw new Error('Invalid Nominatim response: invalid result structure');
    }

    const record = result as Record<string, unknown>;

    if (
      typeof record.lat !== 'string' ||
      typeof record.lon !== 'string' ||
      typeof record.display_name !== 'string'
    ) {
      throw new Error('Invalid Nominatim response: invalid result structure');
    }

    const latitudeString = record.lat.trim();
    const longitudeString = record.lon.trim();
    const displayName = record.display_name.trim();

    if (
      latitudeString.length === 0 ||
      longitudeString.length === 0 ||
      displayName.length === 0
    ) {
      throw new Error('Invalid Nominatim response: empty required fields');
    }

    const latitude = Number(latitudeString);
    const longitude = Number(longitudeString);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new Error('Invalid Nominatim response: invalid coordinates');
    }

    return {
      latitude,
      longitude,
      displayName,
    };
  }
}
