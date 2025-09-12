import { PartialType } from '@nestjs/swagger';
import { CreateDatasetDto } from './create-dataset.dto';

export class UpdateDatasetDto extends PartialType(CreateDatasetDto) {
    // Inherits all properties from CreateDatasetDto but makes them optional
    // Allows partial updates to datasets
}
