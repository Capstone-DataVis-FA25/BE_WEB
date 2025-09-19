import { Global, Module } from '@nestjs/common';
import { KmsService } from './kms.service';

@Global()
@Module({
    providers: [KmsService],
    exports: [KmsService],
})
export class KmsModule { }
