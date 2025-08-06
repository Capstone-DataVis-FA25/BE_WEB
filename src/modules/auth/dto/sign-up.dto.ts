import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength, IsOptional } from 'class-validator';

export class SignUpDto {
	@ApiProperty()
	@IsEmail()
	@IsNotEmpty()
	email: string;

	@ApiProperty()
	@IsString()
	@IsNotEmpty()
	@MinLength(6)
	password: string;

	@ApiProperty({ required: false })
	@IsOptional()
	@IsString()
	firstName?: string;

	@ApiProperty({ required: false })
	@IsOptional()
	@IsString()
	lastName?: string;
}
