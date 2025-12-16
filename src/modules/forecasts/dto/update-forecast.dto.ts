import { PartialType } from '@nestjs/mapped-types';
import { CreateForecastDto } from './create-forecast.dto';
import { IsString, IsOptional } from 'class-validator';

export class UpdateForecastDto extends PartialType(CreateForecastDto) {
  @IsOptional()
  @IsString()
  analyze?: string;
}

