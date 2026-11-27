import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { NearbyVillagesQueryDto } from './nearby-villages-query.dto';

const query = (values: Record<string, unknown> = {}) =>
  plainToInstance(NearbyVillagesQueryDto, values);

describe('NearbyVillagesQueryDto', () => {
  it('defaults an omitted radius to 10 km', async () => {
    const dto = query();

    expect(dto.radius).toBe(10);
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each(['0.5', '100'])('accepts a valid radius of %s km', async (radius) => {
    const dto = query({ radius });

    expect(dto.radius).toBe(Number(radius));
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([0, -1, 100.01, 'not-a-number'])(
    'rejects invalid radius %s',
    async (radius) => {
      const errors = await validate(query({ radius }));

      expect(errors.map((error) => error.property)).toContain('radius');
    },
  );
});
