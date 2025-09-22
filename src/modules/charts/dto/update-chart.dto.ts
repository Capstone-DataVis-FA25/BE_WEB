import { PartialType } from '@nestjs/swagger';
import { CreateChartDto } from './create-chart.dto';

export class UpdateChartDto extends PartialType(CreateChartDto) {
    // Inherits all properties from CreateChartDto but makes them optional
    // Allows partial updates to charts
}