import { Request } from 'express';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { AuthService } from '../auth.service';
import { TokenPayload } from '../interfaces/token.interface';
import { refresh_token_private_key } from 'src/constraints/jwt.constraint';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtRefreshTokenStrategy extends PassportStrategy(
	Strategy,
	'refresh_token',
) {
	constructor(
		private readonly usersService: UsersService,
	) {
		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			ignoreExpiration: false,
			secretOrKey: refresh_token_private_key,
			passReqToCallback: true,
		});
	}

	async validate(req: Request, payload: any) {
		const refreshToken = req.get('authorization')?.replace('Bearer', '').trim();
		
		const user = await this.usersService.findOne(payload.sub);
		if (!user) {
			throw new UnauthorizedException('User not found');
		}

		if (!user.isActive) {
			throw new UnauthorizedException('Account is deactivated');
		}

		// Return user info with refresh token for validation
		return {
			...payload,
			refreshToken,
			userId: user.id,
			email: user.email,
			role: user.role,
			isActive: user.isActive,
		};
	}
}
