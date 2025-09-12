import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class SignInDto {
	@ApiProperty({
		description: 'User email address',
		example: 'congminh23092004@gmail.com'
	})
	@IsEmail()
	@IsNotEmpty()
	email: string;

	@ApiProperty({
		description: 'User password',
		example: '23092004!Aa'
	})
	@IsString()
	@IsNotEmpty()
	password: string;
}
