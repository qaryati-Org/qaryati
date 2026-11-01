import { Injectable } from '@nestjs/common';
import {
  GeocodingProvider,
  GeocodingResult,
} from '../interfaces/geocoding-provider.interface';

interface NominatimSearchResult {
  lat: string;
  lon: string;
  display_name: string;
}

@Injectable()
export class NominatimGeocodingProvider implements GeocodingProvider {
  async geocode(address: string): Promise<GeocodingResult | null> {
    try {
      const url = new URL(
        'https://nominatim.openstreetmap.org/search',
      );

      url.searchParams.set('q', address);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('limit', '1');

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Qaryati/1.0',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(
          `Nominatim request failed: ${response.status}`,
        );
      }

      const results =
        (await response.json()) as NominatimSearchResult[];

      if (results.length === 0) {
        return null;
      }

      const result = results[0];

      return {
        latitude: Number(result.lat),
        longitude: Number(result.lon),
        displayName: result.display_name,
      };
    } catch (error) {
      console.error('Geocoding request failed:', error);
      return null;
    }
  }
}