import { GeocodingCacheService } from './geocoding-cache.service';
import { GeocodingResult } from '../interfaces/geocoding-provider.interface';

describe('GeocodingCacheService', () => {
  let service: GeocodingCacheService;

  const mockResult: GeocodingResult = {
    latitude: 32.2211,
    longitude: 35.2544,
    displayName: 'Nablus, Palestine',
  };

  beforeEach(() => {
    service = new GeocodingCacheService();
  });

  describe('get', () => {
    it('returns null when the key does not exist', () => {
      expect(service.get('nablus')).toBeNull();
    });

    it('returns a cached result', () => {
      service.set('nablus', mockResult);

      expect(service.get('nablus')).toEqual(mockResult);
    });

    it('returns a copy of the cached result', () => {
      service.set('nablus', mockResult);

      const result = service.get('nablus');
      result!.latitude = 0;

      expect(service.get('nablus')).toEqual(mockResult);
    });

    it('returns null when the entry has expired', () => {
      jest.useFakeTimers();

      try {
        service.set('nablus', mockResult);

        jest.advanceTimersByTime(24 * 60 * 60 * 1000);

        expect(service.get('nablus')).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });

    it('keeps the entry before the TTL expires', () => {
      jest.useFakeTimers();

      try {
        service.set('nablus', mockResult);

        jest.advanceTimersByTime(24 * 60 * 60 * 1000 - 1);

        expect(service.get('nablus')).toEqual(mockResult);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('set', () => {
    it('removes expired entries before inserting a new entry', () => {
      jest.useFakeTimers();

      try {
        service.set('old-location', mockResult);

        jest.advanceTimersByTime(24 * 60 * 60 * 1000);

        service.set('new-location', mockResult);

        expect(service.get('old-location')).toBeNull();
        expect(service.get('new-location')).toEqual(mockResult);
      } finally {
        jest.useRealTimers();
      }
    });

    it('evicts the oldest entry when the cache reaches capacity', () => {
      for (let i = 0; i < 1000; i++) {
        service.set(`location-${i}`, mockResult);
      }

      service.set('new-location', mockResult);

      expect(service.get('location-0')).toBeNull();
      expect(service.get('location-1')).toEqual(mockResult);
      expect(service.get('new-location')).toEqual(mockResult);
    });

    it('refreshes insertion order when updating an existing key', () => {
      for (let i = 0; i < 1000; i++) {
        service.set(`location-${i}`, mockResult);
      }

      service.set('location-0', {
        ...mockResult,
        displayName: 'Updated Location',
      });

      service.set('new-location', mockResult);

      expect(service.get('location-0')).toEqual({
        ...mockResult,
        displayName: 'Updated Location',
      });

      expect(service.get('location-1')).toBeNull();
    });

    it('refreshes the TTL when updating an existing key', () => {
      jest.useFakeTimers();

      try {
        service.set('nablus', mockResult);

        // Advance 12 hours.
        jest.advanceTimersByTime(12 * 60 * 60 * 1000);

        const updatedResult: GeocodingResult = {
          ...mockResult,
          displayName: 'Updated Nablus Location',
        };

        // Updating the key should refresh its TTL.
        service.set('nablus', updatedResult);

        // Advance another 12 hours.
        jest.advanceTimersByTime(12 * 60 * 60 * 1000);

        expect(service.get('nablus')).toEqual(updatedResult);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('clear', () => {
    it('removes all cached entries', () => {
      service.set('location-1', mockResult);
      service.set('location-2', mockResult);

      service.clear();

      expect(service.get('location-1')).toBeNull();
      expect(service.get('location-2')).toBeNull();
    });
  });
});
