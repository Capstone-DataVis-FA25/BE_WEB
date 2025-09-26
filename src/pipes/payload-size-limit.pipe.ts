import { BadRequestException, PipeTransform } from '@nestjs/common';

export class PayloadSizeLimitPipe implements PipeTransform {
    constructor(private readonly maxBytes: number) { }

    transform(value: any) {
        const size = Buffer.byteLength(JSON.stringify(value));
        if (size > this.maxBytes) {
            const maxSizeInMB = (this.maxBytes / (1024 * 1024)).toFixed(1);
            throw new BadRequestException(`Dataset payload too large. Maximum allowed size is ${maxSizeInMB}MB. Current size is ${(size / (1024 * 1024)).toFixed(1)}MB.`);
        }
        return value;
    }
}