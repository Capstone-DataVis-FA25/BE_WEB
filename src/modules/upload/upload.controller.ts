import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

@ApiTags('upload')
@Controller('upload')
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly configService: ConfigService,
  ) {}

  @Post('image')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload an image and get a public URL' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'Image file (jpg, png, gif, webp...)' },
      },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 200, description: 'Image uploaded successfully', schema: { example: { url: 'https://res.cloudinary.com/your_cloud/image/upload/v1699/abc.png', public_id: 'abc' } } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
      storage: memoryStorage(),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new BadRequestException('Only image files are allowed!'), false);
        }
        cb(null, true);
      },
    })
  )
  async uploadImage(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (!file.buffer) {
      throw new BadRequestException('Uploaded file has no buffer');
    }

    try {
      const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
      if (cloudName) {
        const result = await this.uploadService.uploadToCloudinary(file.buffer, file.originalname);
        return { url: result.url, public_id: result.public_id };
      }

    
    } catch (err) {
      console.error('Upload error', err);
      throw new InternalServerErrorException('Failed to upload image');
    }
  }
}
