import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { KmsService } from '../modules/kms/kms.service';

// create one global extended client instance with decryption
function createExtendedPrisma() {
	const kmsService = new KmsService();

	return new PrismaClient().$extends({
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
	}).$extends({
		query: {
			$allModels: {
				async $allOperations({ model, operation, args, query }) {
					// Execute the original query first
					const result = await query(args);

					// Function to recursively decrypt DataHeader objects
					const decryptDataHeaders = async (obj: any) => {
						if (!obj || typeof obj !== 'object') return;

						// Handle arrays
						if (Array.isArray(obj)) {
							for (const item of obj) {
								await decryptDataHeaders(item);
							}
							return;
						}

						// If this object has DataHeader properties, decrypt it
						if (obj.encryptedData && obj.encryptedDataKey && obj.iv && obj.authTag) {
							try {
								const decryptedDataString = await kmsService.decryptData(
									obj.encryptedData,
									obj.encryptedDataKey,
									obj.iv,
									obj.authTag
								);
								obj.data = JSON.parse(decryptedDataString);

								// Remove the encrypted fields from the response for security
								delete obj.encryptedData;
								delete obj.encryptedDataKey;
								delete obj.iv;
								delete obj.authTag;
							} catch (error) {
								console.error('Failed to decrypt data:', error);
								obj.data = [];

								// Even on error, remove the encrypted fields for security
								delete obj.encryptedData;
								delete obj.encryptedDataKey;
								delete obj.iv;
								delete obj.authTag;
							}
						}

						// Recursively process all object properties
						for (const key in obj) {
							if (obj[key] && typeof obj[key] === 'object') {
								await decryptDataHeaders(obj[key]);
							}
						}
					};

					// Apply decryption to the result
					await decryptDataHeaders(result);

					return result;
				},
			},
		},
	});
}

const extendedPrisma = createExtendedPrisma();

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
