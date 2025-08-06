import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength, IsEnum } from 'class-validator';

export enum UserRole {
	USER = 'USER',
	ADMIN = 'ADMIN',
}

export class CreateUserDto {
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

	@ApiProperty({ enum: UserRole, required: false })
	@IsOptional()
	@IsEnum(UserRole)
	role?: UserRole;
}
