
export interface GeocodingResult {
  latitude: number;
  longitude: number;
  displayName: string;
}

export interface GeocodingProvider {
  geocode(address: string): Promise<GeocodingResult | null>;
}
