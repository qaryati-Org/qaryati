// Public API of the source module for other modules:
// import { SourceService, VerificationStatus } from '../source';
export { SourceModule } from './source.module';
export { SourceService } from './source.service';
export { VerifiableEntity } from './verification/verifiable.entity';
export { VerificationStatus } from './verification/verification-status.enum';
export {
  assertTransition,
  canTransition,
} from './verification/verification-transitions';
