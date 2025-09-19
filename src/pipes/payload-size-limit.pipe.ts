import { BadRequestException, PipeTransform } from '@nestjs/common';

export class PayloadSizeLimitPipe implements PipeTransform {
    constructor(private readonly maxBytes: number) { }

    transform(value: any) {
        const size = Buffer.byteLength(JSON.stringify(value));
        if (size > this.maxBytes) {
            throw new BadRequestException(`Payload too large (max ${this.maxBytes} bytes)`);
        }
        return value;
    }
}
