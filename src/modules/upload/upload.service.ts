import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { join } from 'path';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import * as streamifier from 'streamifier';

@Injectable()
export class UploadService {
  private readonly uploadDir: string;
  private readonly cloudEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.uploadDir = join(process.cwd(), 'public', 'uploads');
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }

    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    this.cloudEnabled = !!(cloudName && apiKey && apiSecret);
    if (this.cloudEnabled) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
      });
    }
  }

  // Local fallback: write buffer to public/uploads
  saveFile(filename: string, buffer: Buffer): string {
    const filePath = join(this.uploadDir, filename);
    writeFileSync(filePath, buffer);
    // Return public accessible path
    return `/uploads/${filename}`;
  }

  // Upload buffer to Cloudinary (image)
  async uploadToCloudinary(buffer: Buffer, originalName?: string): Promise<{ url: string; public_id: string }> {
    if (!this.cloudEnabled) {
      throw new InternalServerErrorException('Cloudinary not configured');
    }

    return new Promise((resolve, reject) => {
      const publicId = originalName ? originalName.replace(/\.[^/.]+$/, '') : undefined;
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: this.configService.get<string>('CLOUDINARY_FOLDER') || 'datavis',
          resource_type: 'image',
          overwrite: false,
        },
        (error: any, result: UploadApiResponse) => {
          if (error) return reject(error);
          if (!result) return reject(new Error('No result from Cloudinary'));
          resolve({ url: result.secure_url, public_id: result.public_id });
        }
      );

      streamifier.createReadStream(buffer).pipe(uploadStream);
    });
  }
}
