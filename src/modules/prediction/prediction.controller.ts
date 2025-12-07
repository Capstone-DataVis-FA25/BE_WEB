import {
  Controller,
  Post,
  Body,
  Get,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { PredictionService } from './prediction.service';
import { PredictQuantityDto } from './dto/predict-quantity.dto';
import { PredictNextDayDto } from './dto/predict-next-day.dto';
import { ChatPredictDto } from './dto/chat-predict.dto';

@ApiTags('prediction')
@ApiBearerAuth()
@Controller('prediction')
export class PredictionController {
  constructor(private readonly predictionService: PredictionService) {}

  @Post('quantity')
 
  @ApiBody({ 
    type: PredictQuantityDto,
    examples: {
      'Dự đoán 1 ngày': {
        value: {
          historicalData: [100, 120, 115, 130, 125, 140, 135],
          steps: 1
        }
      },
      'Dự đoán 7 ngày': {
        value: {
          historicalData: [1000, 1100, 1050, 1200, 1150, 1300, 1250, 1400, 1350, 1500, 1450, 1600, 1550, 1700],
          steps: 7
        }
      },
      'Dự đoán 14 ngày': {
        value: {
          historicalData: [5000, 5200, 4800, 5100, 5300, 5400, 5600, 5800, 6000, 6200, 6100, 6300, 6500, 6700, 6900, 7100, 6800, 7300, 7500, 7200, 7700, 7900, 7600, 8100, 8300, 8000, 8500, 8700, 8400, 8900],
          steps: 14
        }
      }
    }
  })
  @ApiOkResponse({
    description: 'Prediction results',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        predictions: { type: 'array', items: { type: 'number' } },
        metadata: {
          type: 'object',
          properties: {
            inputLength: { type: 'number' },
            steps: { type: 'number' },
            min: { type: 'number' },
            max: { type: 'number' },
          },
        },
      },
    },
  })
  async predictQuantity(@Body() dto: PredictQuantityDto) {
    try {
      return await this.predictionService.predictQuantity(dto);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Prediction failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('model-info')

  @ApiOkResponse({
    description: 'Model information',
    schema: {
      example: {
        loaded: true,
        modelExists: true,
        preprocessorExists: true,
        preprocessor: {
          scaler_y_min: 1,
          scaler_y_max: 80995
        },
        inputNames: ['input'],
        outputNames: ['output'],
        message: 'ONNX model loaded and ready for inference'
      }
    }
  })
  getModelInfo() {
    return this.predictionService.getModelInfo();
  }

  @Post('next-day')
  @ApiOperation({ 
    summary: '📅 Dự đoán doanh số ngày tiếp theo',
   
  })
  @ApiBody({ 
    type: PredictNextDayDto,
    examples: {
      '7 ngày - Cơ bản': {
        value: {
          dailySales: [
            { date: '2010-12-01', quantity: 1200 },
            { date: '2010-12-02', quantity: 1350 },
            { date: '2010-12-03', quantity: 1180 },
            { date: '2010-12-04', quantity: 1420 },
            { date: '2010-12-05', quantity: 1560 },
            { date: '2010-12-06', quantity: 1490 },
            { date: '2010-12-07', quantity: 1630 },
          ]
        }
      },
      '14 ngày - Chính xác hơn': {
        value: {
          dailySales: [
            { date: '2010-12-01', quantity: 15234 },
            { date: '2010-12-02', quantity: 16789 },
            { date: '2010-12-03', quantity: 14567 },
            { date: '2010-12-04', quantity: 18234 },
            { date: '2010-12-05', quantity: 19456 },
            { date: '2010-12-06', quantity: 17890 },
            { date: '2010-12-07', quantity: 20123 },
            { date: '2010-12-08', quantity: 21456 },
            { date: '2010-12-09', quantity: 19876 },
            { date: '2010-12-10', quantity: 22345 },
            { date: '2010-12-11', quantity: 23456 },
            { date: '2010-12-12', quantity: 21987 },
            { date: '2010-12-13', quantity: 24567 },
            { date: '2010-12-14', quantity: 25678 },
          ],
          country: 'United Kingdom'
        }
      },
      'Với filter': {
        value: {
          dailySales: [
            { date: '2010-12-01', quantity: 120 },
            { date: '2010-12-02', quantity: 135 },
            { date: '2010-12-03', quantity: 118 },
            { date: '2010-12-04', quantity: 142 },
            { date: '2010-12-05', quantity: 156 },
            { date: '2010-12-06', quantity: 149 },
            { date: '2010-12-07', quantity: 163 },
          ],
          stockCode: '85123A',
          country: 'United Kingdom'
        }
      }
    }
  })
  @ApiOkResponse({
    description: 'Kết quả dự đoán cho ngày tiếp theo',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        nextDayPrediction: { type: 'number', description: 'Dự đoán số lượng cho ngày tiếp theo' },
        nextDate: { type: 'string', description: 'Ngày dự đoán (YYYY-MM-DD)' },
        confidence: { type: 'string', description: 'Độ tin cậy của dự đoán' },
        inputPeriod: {
          type: 'object',
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
            days: { type: 'number' },
          },
        },
        trend: { type: 'string', description: 'Xu hướng: increasing, decreasing, stable' },
      },
    },
  })
  async predictNextDay(@Body() dto: PredictNextDayDto) {
    try {
      return await this.predictionService.predictNextDay(dto);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Next day prediction failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('chat')
  @ApiOperation({ 
    summary: '💬 Chat với AI để dự đoán doanh số',
    
  })
  @ApiBody({ 
    type: ChatPredictDto,
    examples: {
      'Ví dụ 1 - Cơ bản': {
        value: {
          prompt: 'Doanh số 7 ngày qua: 1000, 1200, 1500, 1800, 2000, 2200, 2500. Dự đoán ngày mai?',
          language: 'vi'
        }
      },
      'Ví dụ 2 - Chi tiết': {
        value: {
          prompt: 'Cửa hàng tôi trong tuần vừa rồi bán được: ngày 1 bán 5000 sản phẩm, ngày 2 bán 5200, ngày 3 bán 4800, ngày 4 bán 5100, ngày 5 bán 5300, ngày 6 bán 5400, ngày 7 bán 5600. Hãy dự đoán ngày mai sẽ bán được bao nhiêu?',
          language: 'vi'
        }
      },
      'Ví dụ 3 - 14 ngày': {
        value: {
          prompt: 'Dữ liệu 14 ngày: 15000, 16500, 14200, 18300, 19500, 17800, 20100, 21500, 19800, 22300, 23500, 21800, 24100, 25500. Dự đoán?',
          language: 'vi'
        }
      },
      'Example 4 - English': {
        value: {
          prompt: 'Sales for the last 7 days: 1000, 1200, 1500, 1800, 2000, 2200, 2500. Predict tomorrow.',
          language: 'en'
        }
      }
    }
  })
  @ApiOkResponse({
    description: 'Kết quả dự đoán từ AI',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string', description: 'Câu trả lời tự nhiên từ AI' },
        prediction: { 
          type: 'object',
          properties: {
            nextDayPrediction: { type: 'number' },
            nextDate: { type: 'string' },
            confidence: { type: 'string' },
            trend: { type: 'string' },
          }
        },
        extractedData: {
          type: 'object',
          properties: {
            quantities: { type: 'array', items: { type: 'number' } },
            dates: { type: 'array', items: { type: 'string' } },
          }
        }
      },
    },
  })
  async chatPredict(@Body() dto: ChatPredictDto) {
    try {
      return await this.predictionService.chatPredict(dto);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Chat prediction failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
