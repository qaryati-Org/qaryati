import { ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { SourceService } from './source.service';
import { Source, SourceType } from './entities/source.entity';

// A driver error is an Error carrying a Postgres code.
const pgError = (code: string): Error =>
  Object.assign(new Error(`database error ${code}`), { code });

describe('SourceService', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const sourceRow = (overrides: Partial<Source> = {}): Source => ({
    id: 'source-1',
    title: 'Census of Palestine',
    type: SourceType.BOOK,
    author: 'Researcher',
    url: 'https://example.com',
    year: 1997,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });

  let repo: {
    findOneBy: jest.Mock;
    existsBy: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
  let service: SourceService;

  beforeEach(() => {
    repo = {
      findOneBy: jest.fn(),
      existsBy: jest.fn(),
      create: jest.fn((source: Partial<Source>) => source),
      save: jest.fn((source: Source) => Promise.resolve(sourceRow(source))),
      remove: jest.fn(),
    };
    service = new SourceService(repo as unknown as Repository<Source>);
  });

  describe('create', () => {
    it('stores omitted optional fields as null', async () => {
      await service.create({
        title: 'Census of Palestine',
        type: SourceType.BOOK,
      });

      expect(repo.create).toHaveBeenCalledWith({
        title: 'Census of Palestine',
        type: SourceType.BOOK,
        author: null,
        url: null,
        year: null,
      });
    });
  });

  describe('update', () => {
    it('changes only the fields that were sent and preserves author', async () => {
      repo.findOneBy.mockResolvedValue(sourceRow());

      const result = await service.update('source-1', {
        title: 'Updated census',
      });

      expect(result.title).toBe('Updated census');
      expect(result.author).toBe('Researcher');
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Updated census',
          author: 'Researcher',
        }),
      );
    });

    it('does not overwrite stored values with undefined fields', async () => {
      repo.findOneBy.mockResolvedValue(sourceRow());

      const result = await service.update('source-1', {
        title: undefined,
        type: undefined,
      });

      expect(result.title).toBe('Census of Palestine');
      expect(result.type).toBe(SourceType.BOOK);
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Census of Palestine',
          type: SourceType.BOOK,
        }),
      );
    });

    it('clears an optional field when it is explicitly null', async () => {
      repo.findOneBy.mockResolvedValue(sourceRow());

      const result = await service.update('source-1', { author: null });

      expect(result.author).toBeNull();
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ author: null }),
      );
    });

    it('throws NotFoundException for an unknown source without saving', async () => {
      repo.findOneBy.mockResolvedValue(null);

      await expect(
        service.update('missing', { title: 'Updated census' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes an unreferenced source', async () => {
      const source = sourceRow();
      repo.findOneBy.mockResolvedValue(source);

      await expect(service.remove('source-1')).resolves.toBeUndefined();
      expect(repo.remove).toHaveBeenCalledWith(source);
    });

    it('throws ConflictException when another record references the source', async () => {
      repo.findOneBy.mockResolvedValue(sourceRow());
      repo.remove.mockRejectedValue(
        new QueryFailedError('DELETE', [], pgError('23503')),
      );

      await expect(service.remove('source-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rethrows unrelated database errors unchanged', async () => {
      const failure = new QueryFailedError('DELETE', [], pgError('08006'));
      repo.findOneBy.mockResolvedValue(sourceRow());
      repo.remove.mockRejectedValue(failure);

      await expect(service.remove('source-1')).rejects.toBe(failure);
    });

    it('throws NotFoundException for an unknown source without removing', async () => {
      repo.findOneBy.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repo.remove).not.toHaveBeenCalled();
    });
  });

  describe('ensureExists', () => {
    it('resolves when the source exists', async () => {
      repo.existsBy.mockResolvedValue(true);

      await expect(service.ensureExists('source-1')).resolves.toBeUndefined();
    });

    it('throws NotFoundException when the source does not exist', async () => {
      repo.existsBy.mockResolvedValue(false);

      await expect(service.ensureExists('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
