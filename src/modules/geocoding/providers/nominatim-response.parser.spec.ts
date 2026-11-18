import { NominatimResponseParser } from './nominatim-response.parser';

describe('NominatimResponseParser', () => {
  let parser: NominatimResponseParser;

  beforeEach(() => {
    parser = new NominatimResponseParser();
  });

  it('parses a valid Nominatim response', () => {
    const data = [
      {
        lat: '32.2211',
        lon: '35.2544',
        display_name: 'Nablus, Palestine',
      },
    ];

    expect(parser.parse(data)).toEqual({
      latitude: 32.2211,
      longitude: 35.2544,
      displayName: 'Nablus, Palestine',
    });
  });

  it('returns null when the response array is empty', () => {
    expect(parser.parse([])).toBeNull();
  });

  it('throws an error when the response is not an array', () => {
    expect(() => parser.parse({ lat: '32.2211' })).toThrow(
      'Invalid Nominatim response: expected an array',
    );
  });

  it('throws an error when the first result is null', () => {
    expect(() => parser.parse([null])).toThrow(
      'Invalid Nominatim response: invalid result structure',
    );
  });

  it('throws an error when the first result is not an object', () => {
    expect(() => parser.parse(['invalid'])).toThrow(
      'Invalid Nominatim response: invalid result structure',
    );
  });

  it('throws an error when required fields are missing', () => {
    const data = [
      {
        lat: '32.2211',
        lon: '35.2544',
      },
    ];

    expect(() => parser.parse(data)).toThrow(
      'Invalid Nominatim response: invalid result structure',
    );
  });

  it('throws an error when coordinate fields are not strings', () => {
    const data = [
      {
        lat: 32.2211,
        lon: '35.2544',
        display_name: 'Nablus, Palestine',
      },
    ];

    expect(() => parser.parse(data)).toThrow(
      'Invalid Nominatim response: invalid result structure',
    );
  });

  it('throws an error when latitude is not numeric', () => {
    const data = [
      {
        lat: 'invalid',
        lon: '35.2544',
        display_name: 'Nablus, Palestine',
      },
    ];

    expect(() => parser.parse(data)).toThrow(
      'Invalid Nominatim response: invalid coordinates',
    );
  });

  it('throws an error when longitude is not numeric', () => {
    const data = [
      {
        lat: '32.2211',
        lon: 'invalid',
        display_name: 'Nablus, Palestine',
      },
    ];

    expect(() => parser.parse(data)).toThrow(
      'Invalid Nominatim response: invalid coordinates',
    );
  });

  it('throws an error when latitude is outside the valid range', () => {
    const data = [
      {
        lat: '91',
        lon: '35.2544',
        display_name: 'Invalid Location',
      },
    ];

    expect(() => parser.parse(data)).toThrow(
      'Invalid Nominatim response: invalid coordinates',
    );
  });

  it('throws an error when longitude is outside the valid range', () => {
    const data = [
      {
        lat: '32.2211',
        lon: '181',
        display_name: 'Invalid Location',
      },
    ];

    expect(() => parser.parse(data)).toThrow(
      'Invalid Nominatim response: invalid coordinates',
    );
  });

  it('accepts coordinates at the geographic boundaries', () => {
    const data = [
      {
        lat: '90',
        lon: '180',
        display_name: 'Boundary Location',
      },
    ];

    expect(parser.parse(data)).toEqual({
      latitude: 90,
      longitude: 180,
      displayName: 'Boundary Location',
    });
  });

  // New tests: negative geographic boundaries

  it('accepts the minimum valid latitude and longitude', () => {
    const data = [
      {
        lat: '-90',
        lon: '-180',
        display_name: 'Boundary Location',
      },
    ];

    expect(parser.parse(data)).toEqual({
      latitude: -90,
      longitude: -180,
      displayName: 'Boundary Location',
    });
  });

  it('rejects latitude below -90', () => {
    const data = [
      {
        lat: '-90.1',
        lon: '35.2544',
        display_name: 'Invalid Location',
      },
    ];

    expect(() => parser.parse(data)).toThrow(
      'Invalid Nominatim response: invalid coordinates',
    );
  });

  it('rejects longitude below -180', () => {
    const data = [
      {
        lat: '32.2211',
        lon: '-180.1',
        display_name: 'Invalid Location',
      },
    ];

    expect(() => parser.parse(data)).toThrow(
      'Invalid Nominatim response: invalid coordinates',
    );
  });
});
