import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    BadRequestException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PerUserPayloadSizeInterceptor implements NestInterceptor {
    constructor(private readonly prismaService: PrismaService) { }

    async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
        const req = context.switchToHttp().getRequest();

        try {
            const userId = req.user?.userId;
            if (!userId) {
                return next.handle();
            }

            const user = await this.prismaService.prisma.user.findUnique({
                where: { id: userId },
                include: { subscriptionPlan: true },
            });

            if (!user) {
                return next.handle();
            }

            const limits = (user.subscriptionPlan?.limits ?? null) as any;
            const maxFileSizeMB = limits?.maxFileSize;

            // if no per-plan limit set, allow unlimited
            if (typeof maxFileSizeMB !== 'number') {
                return next.handle();
            }

            const maxBytes = Math.floor(maxFileSizeMB * 1024 * 1024);
            const size = Buffer.byteLength(JSON.stringify(req.body || {}));

            if (size > maxBytes) {
                const maxSizeInMB = (maxBytes / (1024 * 1024)).toFixed(1);
                const currentMB = (size / (1024 * 1024)).toFixed(1);
                throw new BadRequestException(
                    `Dataset payload too large. Maximum allowed size is ${maxSizeInMB}MB. Current size is ${currentMB}MB.`,
                );
            }

            return next.handle();
        } catch (err) {
            if (err instanceof BadRequestException) throw err;
            // On any unexpected error, don't block the request; let other layers handle it
            return next.handle();
        }
    }
}
