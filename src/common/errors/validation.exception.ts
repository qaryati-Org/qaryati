import { BadRequestException, ValidationError } from '@nestjs/common';
import { FieldError } from './error-response';

// Raised by the global ValidationPipe so validation failures carry
// per-field details instead of Nest's default flat message array.
export class ValidationException extends BadRequestException {
  constructor(public readonly fieldErrors: FieldError[]) {
    super('Request validation failed');
  }

  static fromValidationErrors(errors: ValidationError[]): ValidationException {
    return new ValidationException(flatten(errors));
  }
}

function flatten(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((e) => {
    const field = parent ? `${parent}.${e.property}` : e.property;
    const own = e.constraints
      ? [{ field, messages: Object.values(e.constraints) }]
      : [];
    return [...own, ...flatten(e.children ?? [], field)];
  });
}
