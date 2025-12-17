import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { AiRequestService } from '../ai-request.service';

/**
 * Guard to check and increment AI request count
 * Apply this guard to AI endpoints that should count towards daily limits
 */
@Injectable()
export class AiRequestGuard implements CanActivate {
    constructor(private readonly aiRequestService: AiRequestService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const userId = request.user?.userId || request.user?.id || request.user?.sub;

        if (!userId) {
            // If no user, let other guards handle authentication
            return true;
        }

        // Check if user has exceeded limit
        await this.aiRequestService.checkAiRequestLimit(userId);

        // Increment the count
        await this.aiRequestService.incrementAiRequestCount(userId);

        return true;
    }
}
