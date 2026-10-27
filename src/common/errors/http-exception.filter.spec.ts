import { ArgumentsHost, Logger, NotFoundException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';
import { ValidationException } from './validation.exception';

function mockHost() {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const req = { originalUrl: '/api/v1/x', method: 'GET', correlationId: 'c-1' };
  const host = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  it('maps HttpException to the standard error body', () => {
    const { host, res } = mockHost();
    filter.catch(new NotFoundException('Village 1 not found'), host);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].error).toMatchObject({
      code: 'NOT_FOUND',
      message: 'Village 1 not found',
      path: '/api/v1/x',
      correlationId: 'c-1',
    });
  });

  it('includes field details for validation errors', () => {
    const { host, res } = mockHost();
    filter.catch(
      new ValidationException([{ field: 'page', messages: ['too small'] }]),
      host,
    );
    expect(res.json.mock.calls[0][0].error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [{ field: 'page', messages: ['too small'] }],
    });
  });

  it('hides internal error messages behind a generic 500', () => {
    const { host, res } = mockHost();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    filter.catch(new Error('relation "secret" does not exist'), host);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].error).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  });
});
