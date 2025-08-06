import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { TokenPayload } from '../interfaces/token.interface';
import { UsersService } from '@modules/users/users.service';
import { access_token_private_key } from 'src/constraints/jwt.constraint';


@Injectable()
export class JwtAccessTokenStrategy extends PassportStrategy(Strategy, 'jwt') {
	constructor(
		private readonly usersService: UsersService,
	) {
		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			ignoreExpiration: false,
			secretOrKey: access_token_private_key,
		});
	}

	async validate(payload: TokenPayload) {
		const user = await this.usersService.findOne(payload.sub);
		if (!user) {
			throw new UnauthorizedException('User not found');
		}

		if (!user.isActive) {
			throw new UnauthorizedException('Account is deactivated');
		}

		// Return user info with payload data
		return {
			...payload,
			userId: user.id,
			email: user.email,
			role: user.role,
			isActive: user.isActive,
		};
	}
}
