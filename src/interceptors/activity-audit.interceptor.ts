import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { ActivityService } from "@modules/activity/activity.service";
import { Logger } from "@nestjs/common";

type RouteMatch = {
  method: string;
  pathRegex: RegExp;
  action: string;
  resource: (req: any, res: any, body: any) => string;
  metadata?: (req: any, res: any, body: any) => Record<string, unknown>;
};

@Injectable()
export class ActivityAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ActivityAuditInterceptor.name);

  private readonly rules: RouteMatch[] = [
    // user register
    {
      method: "POST",
      pathRegex: /^\/auth\/register$/,
      action: "user_register",
      resource: () => "user",
      metadata: (req) => ({ email: req.body?.email }),
    },
    // block user
    {
      method: "POST",
      pathRegex: /^\/admin\/users\/(.+)\/block$/,
      action: "block_user",
      resource: (req) => `user:${req.params?.id}`,
    },
    // unlock user
    {
      method: "POST",
      pathRegex: /^\/admin\/users\/(.+)\/unlock$/,
      action: "unlock_user",
      resource: (req) => `user:${req.params?.id}`,
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
      metadata: (_req, _res, body) => ({ name: body?.name }),
    },
    // self delete account
    {
      method: "DELETE",
      pathRegex: /^\/users\/me$/,
      action: "delete_self_account",
      resource: (req) => `user:${req.user?.user_id ?? "me"}`,
    },
  ];

  constructor(private readonly activityService: ActivityService) {}

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

    // Normalize actor id from various shapes (userId, user_id, id, email)
    const actorIdRaw = request.user ?? {};
    const actorId =
      actorIdRaw.userId ?? actorIdRaw.user_id ?? actorIdRaw.id ?? actorIdRaw.email ?? null;
    const actorType = request.user ? "user" : "anonymous";

    const startedAt = Date.now();

    return next.handle().pipe(
      tap(async (body) => {
        // Only log success (2xx) to avoid noise; adjust if needed
        const statusCode = response.statusCode;
        if (statusCode >= 200 && statusCode < 300) {
          try {
            // Prefer response body (body) produced by controller; fall back to request.body
            const responseBody = body ?? request.body;

            // If responseBody is wrapped (e.g., { data: {...} } or { result: {...} }), try to extract inner object
            const canonicalBody = this.unwrapResponseBody(responseBody);

            // Build resource and metadata using canonicalBody
            let resource = matched.resource(request, response, canonicalBody);
            // If resource id missing, attempt to use canonicalBody.id
            if (!resource || resource.endsWith(':')) {
              const extractedId = this.extractId(canonicalBody) || request.params?.id;
              if (extractedId) resource = `${this.inferResourcePrefix(matched.action)}:${extractedId}`;
            }

            const metaFromRule = matched.metadata
              ? matched.metadata(request, response, canonicalBody)
              : {};

            const metadata = {
              ...metaFromRule,
              method,
              path,
              statusCode,
              durationMs: Date.now() - startedAt,
              ip: this.extractIp(request),
              userAgent: request.get?.("user-agent"),
            } as Record<string, unknown>;

            // Ensure name is present when possible
            if (!metadata["name"]) {
              const name = this.extractName(canonicalBody) || request.body?.name || request.body?.title || null;
              if (name) metadata["name"] = name;
            }

            // Log the exact payload that will be sent to ActivityService for debugging
            const logPayload = {
              actorId: actorId ?? undefined,
              actorType,
              action: matched.action,
              resource,
              metadata,
              canonicalBodyPreview: this.buildBodyPreview(canonicalBody),
            };
            try {
              this.logger.debug('Activity log payload: ' + JSON.stringify(logPayload, null, 2));
            } catch (e) {
              this.logger.debug('Activity log payload (non-serializable)');
            }

            await this.activityService.createLog({
              actorId: actorId ?? undefined,
              actorType,
              action: matched.action,
              resource,
              metadata,
            });
          } catch (e) {
            // swallow logging error
            this.logger.error('Failed to build/send activity log', e as any);
          }
        }
      })
    );
  }

  private unwrapResponseBody(body: any): any {
    if (!body) return body;
    // Common wrappers
    if (body.data) return body.data;
    if (body.result) return body.result;
    if (body.payload) return body.payload;
    return body;
  }

  private extractId(body: any): string | null {
    if (!body) return null;
    if (typeof body === "string" || typeof body === "number") return String(body);
    if (body.id) return String(body.id);
    if (body._id) return String(body._id);
    if (body.uuid) return String(body.uuid);
    return null;
  }

  private extractName(body: any): string | null {
    if (!body) return null;
    if (body.name) return String(body.name);
    if (body.title) return String(body.title);
    if (body.label) return String(body.label);
    return null;
  }

  private extractIp(req: any): string {
    const xff = req.headers && (req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For']);
    if (xff) {
      return Array.isArray(xff) ? xff[0] : String(xff).split(',')[0].trim();
    }
    if (req.ip) return req.ip;
    if (req.connection && req.connection.remoteAddress) return req.connection.remoteAddress;
    return '';
  }

  private inferResourcePrefix(action: string): string {
    if (action.includes('dataset')) return 'dataset';
    if (action.includes('chart')) return 'chart';
    if (action.includes('user')) return 'user';
    return 'resource';
  }

  private buildBodyPreview(body: any): any {
    if (!body) return null;
    if (typeof body === 'string' || typeof body === 'number') return body;
    const preview: Record<string, any> = {};
    if (body.id) preview.id = body.id;
    if (body._id) preview._id = body._id;
    if (body.uuid) preview.uuid = body.uuid;
    if (body.name) preview.name = body.name;
    if (body.title) preview.title = body.title;
    // include small samples of other keys
    const extraKeys = Object.keys(body).filter(k => !['id','_id','uuid','name','title'].includes(k)).slice(0,5);
    for (const k of extraKeys) {
      try { preview[k] = body[k]; } catch { preview[k] = '[unserializable]'; }
    }
    return preview;
  }
}
