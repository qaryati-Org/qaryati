import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { RejectPopulationRecordDto } from './reject-population-record.dto';
import { VerifyPopulationRecordDto } from './verify-population-record.dto';

async function validateDto<T extends object>(
  dto: new () => T,
  input: Record<string, unknown>,
): Promise<ValidationError[]> {
  return validate(plainToInstance(dto, input), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('Population review DTOs', () => {
  describe('VerifyPopulationRecordDto', () => {
    it('accepts an omitted review note', async () => {
      await expect(
        validateDto(VerifyPopulationRecordDto, {}),
      ).resolves.toHaveLength(0);
    });

    it('accepts a valid review note', async () => {
      await expect(
        validateDto(VerifyPopulationRecordDto, {
          reviewNote: 'Evidence confirmed',
        }),
      ).resolves.toHaveLength(0);
    });

    it.each([null, 123, 'x'.repeat(1001)])(
      'rejects invalid review note value %p',
      async (reviewNote) => {
        const errors = await validateDto(VerifyPopulationRecordDto, {
          reviewNote,
        });
        expect(errors).not.toHaveLength(0);
      },
    );
  });

  describe('RejectPopulationRecordDto', () => {
    it('accepts a valid nonempty explanation', async () => {
      await expect(
        validateDto(RejectPopulationRecordDto, {
          reviewNote: 'Conflicts with the cited source',
        }),
      ).resolves.toHaveLength(0);
    });

    it.each([
      ['missing', {}],
      ['empty', { reviewNote: '' }],
      ['whitespace-only', { reviewNote: ' \t ' }],
      ['too long', { reviewNote: 'x'.repeat(1001) }],
      ['non-string', { reviewNote: 123 }],
    ])('rejects a %s explanation', async (_label, input) => {
      const errors = await validateDto(RejectPopulationRecordDto, input);
      expect(errors).not.toHaveLength(0);
    });
  });

  it.each([
    ['VerifyPopulationRecordDto', VerifyPopulationRecordDto],
    ['RejectPopulationRecordDto', RejectPopulationRecordDto],
  ])('rejects client-controlled review metadata for %s', async (_name, dto) => {
    const errors = await validateDto(dto, {
      reviewNote: 'A valid note',
      reviewerId: '00000000-0000-4000-8000-000000000001',
      reviewedById: '00000000-0000-4000-8000-000000000001',
      reviewedAt: '2026-03-01T12:00:00.000Z',
      status: 'VERIFIED',
      role: 'ADMIN',
    });

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'reviewerId',
        'reviewedById',
        'reviewedAt',
        'status',
        'role',
      ]),
    );
  });
});
