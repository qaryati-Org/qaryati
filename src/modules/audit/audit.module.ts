import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditActorSubscriber } from './audit-actor.subscriber';
import { AuditContextInterceptor } from './audit-context.interceptor';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditLog } from './entities/audit-log.entity';

// Audit log of every change to village data and users. Other modules do not
// call anything here: database triggers record the rows, the interceptor and
// the subscriber tell the database who the caller is.
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  controllers: [AuditController],
  providers: [
    AuditService,
    AuditActorSubscriber,
    { provide: APP_INTERCEPTOR, useClass: AuditContextInterceptor },
  ],
})
export class AuditModule {}
