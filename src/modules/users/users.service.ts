import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto, UserRole } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserWithoutPassword } from '../../types/user.types';
import { UpdateProfileDto } from '../auth/dto/update-profile.dto';
import * as bcrypt from 'bcryptjs';
import { ChangePasswordDTO } from './dto/change-password.dto';

@Injectable()
export class UsersService {
	constructor(private prisma: PrismaService) {}

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

	async remove(id: string): Promise<void> {
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

<<<<<<< HEAD
	async updateProfile(userId: string, updateProfileDto: UpdateProfileDto): Promise<User> {
		// Check if email is being updated and if it's already taken
		if (updateProfileDto.email) {
			const existingUser = await this.prisma.user.findUnique({
				where: { 
					email: updateProfileDto.email,
					NOT: { id: userId }
				}
			});
			
			if (existingUser) {
				throw new ConflictException('Email already exists');
			}
		}

		// Update user profile
		const updatedUser = await this.prisma.user.update({
			where: { id: userId },
			data: {
				firstName: updateProfileDto.firstName,
				lastName: updateProfileDto.lastName,
				email: updateProfileDto.email,
			},
		});

		return updatedUser as User;
=======
	async changePassword(userId : string, dto : ChangePasswordDTO){
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
		});

		if (!user){
			throw new Error('User not found');
		};

		if (dto.new_password !== dto.confirm_password) {
			throw new Error('New password and confirmation password do not match');
		}

		const isOldPasswordValid = await bcrypt.compare(dto.old_password, user.password);
		if (!isOldPasswordValid) {
			throw new Error('Old password is incorrect');
		}

		const hashedNewPassword = await bcrypt.hash(dto.new_password, 10);
		if(hashedNewPassword)
		await this.prisma.user.update({
			where: { id: userId },
			data: { password: hashedNewPassword },
		});
>>>>>>> ca24cf99317381adaa5a281688ce1652e42a2865
	}
}
