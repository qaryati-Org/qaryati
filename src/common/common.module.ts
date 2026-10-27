import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { CorrelationIdMiddleware } from './logging/correlation-id.middleware';
import { RequestLoggingMiddleware } from './logging/request-logging.middleware';

@Module({})
export class CommonModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Order matters: the correlation id must exist before logging uses it.
    consumer
      .apply(CorrelationIdMiddleware, RequestLoggingMiddleware)
      .forRoutes('*path');
  }
}
