import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// create one global extended client instance
const extendedPrisma = new PrismaClient().$extends({
	result: {
		user: {
			isSocialAccount: {
				needs: { password: true },
				compute(user) {
					return !user.password || user.password.trim() === '';
				},
			},
		},
	},
});

export type ExtendedPrismaClient = typeof extendedPrisma;

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
	// the actual client instance you’ll use
	readonly prisma: ExtendedPrismaClient = extendedPrisma;

	async onModuleInit() {
		await this.prisma.$connect();
	}

	async onModuleDestroy() {
		await this.prisma.$disconnect();
	}
}
