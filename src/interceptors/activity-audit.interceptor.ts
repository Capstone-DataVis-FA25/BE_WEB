import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { ActivityService } from "@modules/activity/activity.service";

type RouteMatch = {
  method: string;
  pathRegex: RegExp;
  action: string;
  resource: (req: any, res: any, body: any) => string;
  metadata?: (req: any, res: any, body: any) => Record<string, unknown>;
};

@Injectable()
export class ActivityAuditInterceptor implements NestInterceptor {
  private readonly rules: RouteMatch[] = [
    // user register
    {
      method: "POST",
      pathRegex: /^\/auth\/signup$/,
      action: "user_register",
      resource: () => "user",
      metadata: (req) => ({ email: req.body?.email }),
    },
    // create dataset
    {
      method: "POST",
      pathRegex: /^\/datasets$/,
      action: "create_dataset",
      resource: (_req, _res, body) => `dataset:${body?.id ?? ""}`,
      metadata: (_req, _res, body) => ({ name: body?.name }),
    },
    // create chart
    {
      method: "POST",
      pathRegex: /^\/charts$/,
      action: "create_chart",
      resource: (_req, _res, body) => `chart:${body?.id ?? ""}`,
      metadata: (_req, _res, body) => ({ name: body?.name, type: body?.type }),
    },
    // self delete account
    {
      method: "DELETE",
      pathRegex: /^\/users$/,
      action: "delete_self_account",
      resource: (req) => `user:${req.user?.user_id ?? "me"}`,
    },
  ];

  constructor(private readonly activityService: ActivityService) { }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== "http") return next.handle();
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const method = request.method;
    const path = request.route?.path || request.path || "";

    const matched = this.rules.find(
      (r) => r.method === method && r.pathRegex.test(path)
    );

    if (!matched) return next.handle();

    const actorId = request.user?.user_id ?? null;
    const actorType = request.user ? "user" : "anonymous";

    const startedAt = Date.now();

    return next.handle().pipe(
      tap(async (body) => {
        // Only log success (2xx) to avoid noise; adjust if needed
        const statusCode = response.statusCode;
        if (statusCode >= 200 && statusCode < 300) {
          try {
            const resource = matched.resource(request, response, body);
            const metaFromRule = matched.metadata
              ? matched.metadata(request, response, body)
              : {};
            const metadata = {
              ...metaFromRule,
              method,
              path,
              statusCode,
              durationMs: Date.now() - startedAt,
              ip: request.ip,
              userAgent: request.get?.("user-agent"),
            };
            await this.activityService.createLog({
              actorId: actorId ?? undefined,
              actorType,
              action: matched.action,
              resource,
              metadata,
            });
          } catch (e) {
            // swallow logging error
          }
        }
      })
    );
  }
}