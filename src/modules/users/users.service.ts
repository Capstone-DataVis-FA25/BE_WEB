import { Injectable, BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto, UserRole } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {  UserWithoutPassword } from '../../types/user.types';
import * as bcrypt from 'bcryptjs';
import { ChangePasswordDTO } from './dto/change-password.dto';
import { User } from "@prisma/client";
@Injectable()
export class UsersService {
	constructor(private prisma: PrismaService) { }

	async create(createUserDto: CreateUserDto): Promise<User> {
		const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

		const user = await this.prisma.user.create({
			data: {
				...createUserDto,
				password: hashedPassword,
				role: createUserDto.role || UserRole.USER,
			},
		});

		return user as User;
	}

	async findAll(): Promise<UserWithoutPassword[]> {
		const users = await this.prisma.user.findMany({
			select: {
				id: true,
				email: true,
				firstName: true,
				lastName: true,
				role: true,
				isActive: true,
				createdAt: true,
				updatedAt: true,
			},
		});

		return users as UserWithoutPassword[];
	}

	async findOne(id: string): Promise<UserWithoutPassword | null> {
		const user = await this.prisma.user.findUnique({
			where: { id },
			select: {
				id: true,
				email: true,
				firstName: true,
				lastName: true,
				role: true,
				isActive: true,
				isVerified: true,
				createdAt: true,
				updatedAt: true,
			},
		});

		return user as UserWithoutPassword | null;
	}

	async findByEmail(email: string): Promise<User | null> {
		const user = await this.prisma.user.findUnique({
			where: { email },
		});

		return user as User | null;
	}

	async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
		const updateData: any = { ...updateUserDto };

		if (updateUserDto.password) {
			updateData.password = await bcrypt.hash(updateUserDto.password, 10);
		}

		const user = await this.prisma.user.update({
			where: { id },
			data: updateData,
		});

		return user as User;
	}

	async remove(id: string, email?: string): Promise<void> {
		if (!email) {
			throw new BadRequestException('Email is required to delete account');
		}
		const user = await this.prisma.user.findUnique({
			where: { id },
		});
		if (!user) {
			throw new NotFoundException('User not found');
		}
		if (user.email !== email) {
			throw new UnauthorizedException('Email is incorrect');
		}
		await this.prisma.user.delete({
			where: { id },
		});
	}

	async updateRefreshToken(userId: string, refreshToken: string): Promise<void> {
		const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

		await this.prisma.user.update({
			where: { id: userId },
			data: {
				currentHashedRefreshToken: hashedRefreshToken,
			},
		});
	}

	async getUserIfRefreshTokenMatches(refreshToken: string, userId: string): Promise<User | null> {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
		});

		if (!user || !user.currentHashedRefreshToken) {
			return null;
		}

		const isRefreshTokenMatching = await bcrypt.compare(
			refreshToken,
			user.currentHashedRefreshToken,
		);

		if (isRefreshTokenMatching) {
			return user as User;
		}

		return null;
	}

	async removeRefreshToken(userId: string): Promise<void> {
		await this.prisma.user.update({
			where: { id: userId },
			data: {
				currentHashedRefreshToken: null,
			},
		});
	}
	async changePassword(userId: string, dto: ChangePasswordDTO): Promise<{ message: string }> {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
		});

		if (!user) {
			throw new NotFoundException('User not found');
		}

		if (dto.new_password !== dto.confirm_password) {
			throw new BadRequestException('New password and confirmation password do not match');
		}

		const isOldPasswordValid = await bcrypt.compare(dto.old_password, user.password);
		if (!isOldPasswordValid) {
			throw new UnauthorizedException('Old password is incorrect');
		}

		const hashedNewPassword = await bcrypt.hash(dto.new_password, 10);

		await this.prisma.user.update({
			where: { id: userId },
			data: { password: hashedNewPassword },
		});

		return {
			message: 'Password changed successfully'
		};
	}

	// Update user profile
	async updateProfile(userId: string, updateUserdto: UpdateUserDto): Promise<{user: User}> {
		// Update user profile
		const updatedUser = await this.prisma.user.update({
			where: { id: userId },
			data: {
				firstName: updateUserdto.firstName,
				lastName: updateUserdto.lastName,
			},
		});

		return {user: updatedUser};
	}
}
