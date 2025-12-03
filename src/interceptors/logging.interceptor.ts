import {
	Injectable,
	NestInterceptor,
	ExecutionContext,
	CallHandler,
	Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
	private readonly logger = new Logger(LoggingInterceptor.name);

	intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
		// Always proceed to next.handle(); if not HTTP, just pass through
		if (context.getType() !== 'http') return next.handle();
		return this.logHttpCall(context, next);
	}

	private logHttpCall(context: ExecutionContext, next: CallHandler) {
		const request = context.switchToHttp().getRequest();
		const user_agent = request.get('user-agent') || '';
		// Prefer X-Forwarded-For (when behind proxy) then request.ip then connection remote address
		const xff =
			(request.headers && (request.headers['x-forwarded-for'] || request.headers['X-Forwarded-For']));
		let ip = '';
		if (xff) {
			ip = Array.isArray(xff) ? xff[0] : String(xff).split(',')[0].trim();
		} else if (request.ip) {
			ip = request.ip;
		} else if (request.connection && request.connection.remoteAddress) {
			ip = request.connection.remoteAddress;
		} else {
			ip = '';
		}

		const { method, path: url } = request;
		const correlation_key = uuidv4();
		// Support multiple user property shapes
		const userObj = request.user || {};
		const user_id =
			userObj.userId ?? userObj.user_id ?? userObj.id ?? userObj.email ?? null;

		// Masked auth header for debugging when user missing
		let authShort = '-';
		const authHeader = request.headers && (request.headers['authorization'] || request.headers['Authorization']);
		if (authHeader && !user_id) {
			const raw = Array.isArray(authHeader) ? authHeader[0] : String(authHeader);
			const parts = raw.split(' ');
			const tokenSnippet = parts[1] ? (parts[1].slice(0, 8) + '...') : parts[0].slice(0, 8) + '...';
			authShort = `${parts[0] || 'Auth'} ${tokenSnippet}`;
		}

		// Short summaries of params and query to help identify requests
		const paramsSummary =
			request.params && Object.keys(request.params).length
				? JSON.stringify(request.params)
				: '';
		const querySummary =
			request.query && Object.keys(request.query).length
				? JSON.stringify(request.query)
				: '';

		this.logger.log(
			`[${correlation_key}] ${method} ${url} user=${user_id ?? '-'} ip=${ip || '-'} auth=${user_id ? '-' : authShort} ua="${user_agent}" params=${paramsSummary || '-'} query=${querySummary || '-'} -> ${context.getClass().name}#${context.getHandler().name}`,
		);

		const now = Date.now();
		return next.handle().pipe(
			finalize(() => {
				const response = context.switchToHttp().getResponse();
				const { statusCode } = response || {};
				const content_length = response?.get ? response.get('content-length') : undefined;

				this.logger.log(
					`[${correlation_key}] ${method} ${url} status=${statusCode ?? '-'} size=${content_length ?? '-'} time=${Date.now() - now}ms user=${user_id ?? '-'} ip=${ip || '-'} auth=${user_id ? '-' : authShort}`,
				);
			}),
		);
	}
}
