import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { PredictQuantityDto } from './dto/predict-quantity.dto';
import * as ort from 'onnxruntime-node';
import * as path from 'path';
import * as fs from 'fs';
import { PredictNextDayDto } from './dto/predict-next-day.dto';
import { ChatPredictDto } from './dto/chat-predict.dto';
import { ConfigService } from '@nestjs/config';

export interface Preprocessor {
  scaler_y_min: number;
  scaler_y_max: number;
}

@Injectable()
export class PredictionService {
  private readonly logger = new Logger(PredictionService.name);
  private session: ort.InferenceSession | null = null;
  private preprocessor: Preprocessor | null = null;
  private readonly modelPath = path.join(process.cwd(), 'src', 'model', 'lstm_quantity_predictor.onnx');
  private readonly preprocessorPath = path.join(process.cwd(), 'src', 'model', 'preprocessor.json');
  private readonly apiKey: string;
  private readonly baseUrl = 'https://openrouter.ai/api/v1';
  private readonly model = 'google/gemini-2.5-flash-lite-preview-09-2025';

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('OPENROUTER_API_KEY') || '';
    this.loadModel();
    this.loadPreprocessor();
  }

  /**
   * Load preprocessor configuration
   */
  private loadPreprocessor() {
    try {
      if (!fs.existsSync(this.preprocessorPath)) {
        this.logger.warn('⚠️ Preprocessor config not found at: ' + this.preprocessorPath);
        return;
      }

      const data = fs.readFileSync(this.preprocessorPath, 'utf-8');
      this.preprocessor = JSON.parse(data);
      this.logger.log('✅ Preprocessor loaded successfully');
      this.logger.log(`   Min: ${this.preprocessor.scaler_y_min}, Max: ${this.preprocessor.scaler_y_max}`);
    } catch (error) {
      this.logger.error('❌ Failed to load preprocessor:', error);
    }
  }

  /**
   * Load ONNX model
   */
  private async loadModel() {
    try {
      if (!fs.existsSync(this.modelPath)) {
        this.logger.warn('⚠️ ONNX model not found at: ' + this.modelPath);
        this.logger.warn('Please export your PyTorch model to ONNX format and place it in src/model/');
        return;
      }

      this.session = await ort.InferenceSession.create(this.modelPath);
      this.logger.log('✅ ONNX model loaded successfully');
      this.logger.log(`📊 Model inputs: ${this.session.inputNames.join(', ')}`);
      this.logger.log(`📊 Model outputs: ${this.session.outputNames.join(', ')}`);
      
      // Log input/output shapes for debugging
      const inputMetadata = this.session.inputNames.map(name => {
        const meta = (this.session as any).inputsInfo?.[name];
        return `${name}: ${meta?.dims || 'unknown shape'}`;
      });
      this.logger.log(`📐 Input shapes: ${inputMetadata.join(', ')}`);
      
    } catch (error) {
      this.logger.error('❌ Failed to load ONNX model:', error);
    }
  }

  /**
   * Predict future quantities based on historical data using ONNX model
   */
  async predictQuantity(dto: PredictQuantityDto) {
    try {
      if (!this.session) {
        throw new InternalServerErrorException('ONNX model not loaded');
      }

      if (!this.preprocessor) {
        throw new InternalServerErrorException('Preprocessor not loaded');
      }

      const { historicalData, steps = 1 } = dto;
      
      // Normalize data using preprocessor config (min-max scaling)
      const { scaler_y_min, scaler_y_max } = this.preprocessor;
      const range = scaler_y_max - scaler_y_min;
      
      const normalizedData = historicalData.map(val => 
        (val - scaler_y_min) / range
      );
      
      this.logger.log(`📊 Input: ${historicalData.slice(0, 5).join(', ')}${historicalData.length > 5 ? '...' : ''}`);
      this.logger.log(`📊 Normalized: ${normalizedData.slice(0, 5).map(v => v.toFixed(4)).join(', ')}${normalizedData.length > 5 ? '...' : ''}`);
      
      // Make predictions
      const predictions: number[] = [];
      let currentSequence = [...normalizedData];

      // Model expects fixed shape [1, 30, 2]
      const EXPECTED_SEQ_LEN = 30;
      const EXPECTED_FEATURES = 2;

      for (let i = 0; i < steps; i++) {
        // Take last EXPECTED_SEQ_LEN values, pad if needed
        let sequence = currentSequence.slice(-EXPECTED_SEQ_LEN);
        
        // Pad with zeros at the beginning if not enough data
        while (sequence.length < EXPECTED_SEQ_LEN) {
          sequence.unshift(0);
        }

        // Create input with 2 features: [value, normalized_index]
        const inputData: number[] = [];
        for (let j = 0; j < EXPECTED_SEQ_LEN; j++) {
          inputData.push(sequence[j]); // feature 1: normalized value
          inputData.push(j / EXPECTED_SEQ_LEN); // feature 2: position in sequence (0 to 1)
        }

        // Create tensor with shape [1, 30, 2]
        const inputTensor = new ort.Tensor(
          'float32',
          Float32Array.from(inputData),
          [1, EXPECTED_SEQ_LEN, EXPECTED_FEATURES]
        );

        // Run inference
        const feeds: Record<string, ort.Tensor> = {};
        feeds[this.session.inputNames[0]] = inputTensor;
        
        const results = await this.session.run(feeds);
        const output = results[this.session.outputNames[0]];
        
        // Get prediction value (normalized)
        const predValue = output.data[0] as number;
        
        // Denormalize using preprocessor
        const denormalizedValue = predValue * range + scaler_y_min;
        predictions.push(Math.round(denormalizedValue));

        // Update sequence for next prediction (keep normalized)
        currentSequence.push(predValue);
        
        this.logger.debug(`Step ${i + 1}: normalized=${predValue.toFixed(4)}, denormalized=${Math.round(denormalizedValue)}`);
      }

      this.logger.log(`✅ Predictions: ${predictions.join(', ')}`);

      return {
        success: true,
        predictions,
        metadata: {
          inputLength: historicalData.length,
          steps,
          scaler_min: scaler_y_min,
          scaler_max: scaler_y_max,
        },
      };
    } catch (error) {
      this.logger.error('❌ Prediction error:', error);
      throw new InternalServerErrorException('Failed to make prediction: ' + error.message);
    }
  }

  /**
   * Predict next day sales quantity based on historical daily data
   */
  async predictNextDay(dto: PredictNextDayDto) {
    try {
      if (!this.session) {
        throw new InternalServerErrorException('ONNX model not loaded');
      }

      if (!this.preprocessor) {
        throw new InternalServerErrorException('Preprocessor not loaded');
      }

      const { dailySales } = dto;
      
      // Sort by date to ensure chronological order
      const sortedSales = [...dailySales].sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      // Extract quantities for prediction
      const quantities = sortedSales.map(item => item.quantity);
      
      // Get date range
      const firstDate = new Date(sortedSales[0].date);
      const lastDate = new Date(sortedSales[sortedSales.length - 1].date);
      const nextDate = new Date(lastDate);
      nextDate.setDate(nextDate.getDate() + 1);

      // Calculate trend
      const firstHalf = quantities.slice(0, Math.floor(quantities.length / 2));
      const secondHalf = quantities.slice(Math.floor(quantities.length / 2));
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      const trendPercent = ((secondAvg - firstAvg) / firstAvg) * 100;
      
      let trend = 'stable';
      if (trendPercent > 5) trend = 'increasing';
      else if (trendPercent < -5) trend = 'decreasing';

      // Normalize data
      const { scaler_y_min, scaler_y_max } = this.preprocessor;
      const range = scaler_y_max - scaler_y_min;
      const normalizedData = quantities.map(val => (val - scaler_y_min) / range);

      // Model expects fixed shape [1, 30, 2]
      const EXPECTED_SEQ_LEN = 30;
      const EXPECTED_FEATURES = 2;

      // Take last EXPECTED_SEQ_LEN values, pad if needed
      let sequence = normalizedData.slice(-EXPECTED_SEQ_LEN);
      
      // Pad with zeros at the beginning if not enough data
      while (sequence.length < EXPECTED_SEQ_LEN) {
        sequence.unshift(0);
      }

      // Create input with 2 features: [value, normalized_index]
      const inputData: number[] = [];
      for (let j = 0; j < EXPECTED_SEQ_LEN; j++) {
        inputData.push(sequence[j]); // feature 1: normalized value
        inputData.push(j / EXPECTED_SEQ_LEN); // feature 2: position in sequence
      }

      // Create tensor with shape [1, 30, 2]
      const inputTensor = new ort.Tensor(
        'float32',
        Float32Array.from(inputData),
        [1, EXPECTED_SEQ_LEN, EXPECTED_FEATURES]
      );

      // Run inference
      const feeds: Record<string, ort.Tensor> = {};
      feeds[this.session.inputNames[0]] = inputTensor;
      
      const results = await this.session.run(feeds);
      const output = results[this.session.outputNames[0]];
      
      // Get prediction (normalized)
      const predValue = output.data[0] as number;
      
      // Denormalize
      const prediction = Math.round(predValue * range + scaler_y_min);

      // Calculate confidence based on data variance
      const mean = quantities.reduce((a, b) => a + b, 0) / quantities.length;
      const variance = quantities.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / quantities.length;
      const stdDev = Math.sqrt(variance);
      const coefficientOfVariation = (stdDev / mean) * 100;
      
      let confidence = 'high';
      if (coefficientOfVariation > 30) confidence = 'low';
      else if (coefficientOfVariation > 15) confidence = 'medium';

      this.logger.log(`📅 Predicting for: ${nextDate.toISOString().split('T')[0]}`);
      this.logger.log(`📊 Input period: ${sortedSales[0].date} to ${sortedSales[sortedSales.length - 1].date} (${quantities.length} days)`);
      this.logger.log(`📈 Prediction: ${prediction} units`);
      this.logger.log(`📉 Trend: ${trend} (${trendPercent.toFixed(1)}%)`);

      return {
        success: true,
        nextDayPrediction: prediction,
        nextDate: nextDate.toISOString().split('T')[0],
        confidence,
        inputPeriod: {
          from: sortedSales[0].date,
          to: sortedSales[sortedSales.length - 1].date,
          days: quantities.length,
        },
        trend,
        trendPercent: parseFloat(trendPercent.toFixed(2)),
        statistics: {
          mean: Math.round(mean),
          stdDev: Math.round(stdDev),
          min: Math.min(...quantities),
          max: Math.max(...quantities),
        },
      };
    } catch (error) {
      this.logger.error('❌ Next day prediction error:', error);
      throw new InternalServerErrorException('Failed to predict next day: ' + error.message);
    }
  }

  /**
   * Chat-based prediction: Extract data from natural language and predict
   */
  async chatPredict(dto: ChatPredictDto) {
    try {
      const { prompt, language = 'vi' } = dto;

      this.logger.log(`💬 Chat prediction request: ${prompt.substring(0, 100)}...`);

      // Call AI to extract data from prompt
      const extractionResult = await this.extractDataFromPrompt(prompt, language);

      if (!extractionResult.success || !extractionResult.quantities || extractionResult.quantities.length === 0) {
        return {
          success: false,
          message: language === 'vi' 
            ? '❌ Không thể trích xuất dữ liệu từ prompt. Vui lòng cung cấp dữ liệu số lượng rõ ràng hơn.'
            : '❌ Could not extract data from prompt. Please provide clearer quantity data.',
          extractedData: extractionResult,
        };
      }

      // Prepare data for prediction
      const dailySales = extractionResult.quantities.map((quantity, index) => {
        // Generate dates if not provided
        let date: string;
        if (extractionResult.dates && extractionResult.dates[index]) {
          date = extractionResult.dates[index];
        } else {
          // Generate sequential dates from today backwards
          const d = new Date();
          d.setDate(d.getDate() - (extractionResult.quantities.length - 1 - index));
          date = d.toISOString().split('T')[0];
        }
        return { date, quantity };
      });

      // Make prediction
      const predictionDto: PredictNextDayDto = { dailySales };
      const prediction = await this.predictNextDay(predictionDto);

      // Generate natural language response
      const response = this.generateNaturalResponse(prediction, extractionResult, language);

      return {
        success: true,
        message: response,
        prediction: {
          nextDayPrediction: prediction.nextDayPrediction,
          nextDate: prediction.nextDate,
          confidence: prediction.confidence,
          trend: prediction.trend,
          trendPercent: prediction.trendPercent,
        },
        extractedData: {
          quantities: extractionResult.quantities,
          dates: dailySales.map(d => d.date),
          count: extractionResult.quantities.length,
        },
        statistics: prediction.statistics,
      };
    } catch (error) {
      this.logger.error('❌ Chat prediction error:', error);
      throw new InternalServerErrorException('Failed to process chat prediction: ' + error.message);
    }
  }

  /**
   * Extract data from natural language prompt using AI
   */
  private async extractDataFromPrompt(prompt: string, language: string): Promise<any> {
    const systemPrompt = language === 'vi' 
      ? `Bạn là trợ lý AI chuyên trích xuất dữ liệu số từ văn bản tiếng Việt.

Nhiệm vụ: Trích xuất các số lượng bán hàng từ prompt của user.

Trả về JSON với format:
{
  "success": true,
  "quantities": [1000, 1200, 1500, ...],
  "dates": ["2024-01-01", "2024-01-02", ...] (optional, nếu có trong prompt),
  "period": "7 ngày" (mô tả ngắn),
  "context": "mô tả ngắn về dữ liệu"
}

Ví dụ prompt: "Trong 7 ngày qua, doanh số là: 1000, 1200, 1500, 1800, 2000, 2200, 2500"
Output: {"success": true, "quantities": [1000, 1200, 1500, 1800, 2000, 2200, 2500], "period": "7 ngày", "context": "doanh số hàng ngày"}

Nếu không tìm thấy số liệu: {"success": false, "error": "Không tìm thấy dữ liệu số lượng"}`
      : `You are an AI assistant specialized in extracting numerical data from text.

Task: Extract sales quantities from user's prompt.

Return JSON format:
{
  "success": true,
  "quantities": [1000, 1200, 1500, ...],
  "dates": ["2024-01-01", "2024-01-02", ...] (optional),
  "period": "7 days" (brief description),
  "context": "brief description of data"
}

If no data found: {"success": false, "error": "No quantity data found"}`;

    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      max_tokens: 2000,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'data_extraction',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              quantities: { 
                type: 'array', 
                items: { type: 'number' },
                description: 'Array of sales quantities'
              },
              dates: { 
                type: 'array', 
                items: { type: 'string' },
                description: 'Optional array of dates'
              },
              period: { type: 'string', description: 'Time period description' },
              context: { type: 'string', description: 'Brief context' },
              error: { type: 'string', description: 'Error message if failed' },
            },
            required: ['success'],
            additionalProperties: false,
          },
        },
      },
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('No response from AI');
    }

    return JSON.parse(content);
  }

  /**
   * Generate natural language response based on prediction
   */
  private generateNaturalResponse(prediction: any, extractedData: any, language: string): string {
    if (language === 'vi') {
      let response = `📊 **Phân tích dữ liệu bán hàng**\n\n`;
      
      if (extractedData.context) {
        response += `Dữ liệu: ${extractedData.context}\n`;
      }
      if (extractedData.period) {
        response += `Thời gian: ${extractedData.period}\n`;
      }
      
      response += `\n📈 **Dự đoán cho ngày ${prediction.nextDate}:**\n`;
      response += `→ Số lượng dự kiến: **${prediction.nextDayPrediction.toLocaleString()} đơn vị**\n\n`;
      
      response += `📉 **Phân tích xu hướng:**\n`;
      if (prediction.trend === 'increasing') {
        response += `→ Xu hướng: **TĂNG** 📈 (+${prediction.trendPercent}%)\n`;
      } else if (prediction.trend === 'decreasing') {
        response += `→ Xu hướng: **GIẢM** 📉 (${prediction.trendPercent}%)\n`;
      } else {
        response += `→ Xu hướng: **ỔN ĐỊNH** ➡️\n`;
      }
      
      response += `→ Độ tin cậy: **${prediction.confidence === 'high' ? 'Cao ✅' : prediction.confidence === 'medium' ? 'Trung bình ⚠️' : 'Thấp ❌'}**\n\n`;
      
      response += `📊 **Thống kê:**\n`;
      response += `→ Trung bình: ${prediction.statistics.mean.toLocaleString()} đơn vị\n`;
      response += `→ Cao nhất: ${prediction.statistics.max.toLocaleString()} đơn vị\n`;
      response += `→ Thấp nhất: ${prediction.statistics.min.toLocaleString()} đơn vị\n`;
      
      return response;
    } else {
      let response = `📊 **Sales Data Analysis**\n\n`;
      
      if (extractedData.context) {
        response += `Data: ${extractedData.context}\n`;
      }
      if (extractedData.period) {
        response += `Period: ${extractedData.period}\n`;
      }
      
      response += `\n📈 **Prediction for ${prediction.nextDate}:**\n`;
      response += `→ Expected quantity: **${prediction.nextDayPrediction.toLocaleString()} units**\n\n`;
      
      response += `📉 **Trend Analysis:**\n`;
      if (prediction.trend === 'increasing') {
        response += `→ Trend: **INCREASING** 📈 (+${prediction.trendPercent}%)\n`;
      } else if (prediction.trend === 'decreasing') {
        response += `→ Trend: **DECREASING** 📉 (${prediction.trendPercent}%)\n`;
      } else {
        response += `→ Trend: **STABLE** ➡️\n`;
      }
      
      response += `→ Confidence: **${prediction.confidence === 'high' ? 'High ✅' : prediction.confidence === 'medium' ? 'Medium ⚠️' : 'Low ❌'}**\n\n`;
      
      response += `📊 **Statistics:**\n`;
      response += `→ Average: ${prediction.statistics.mean.toLocaleString()} units\n`;
      response += `→ Maximum: ${prediction.statistics.max.toLocaleString()} units\n`;
      response += `→ Minimum: ${prediction.statistics.min.toLocaleString()} units\n`;
      
      return response;
    }
  }

  /**
   * Get model information
   */
  getModelInfo() {
    const modelExists = fs.existsSync(this.modelPath);
    const preprocessorExists = fs.existsSync(this.preprocessorPath);

    if (!this.session) {
      return {
        loaded: false,
        modelExists,
        preprocessorExists,
        modelPath: this.modelPath,
        preprocessorPath: this.preprocessorPath,
        message: modelExists 
          ? 'Model file found but failed to load. Check server logs.'
          : 'ONNX model not found. Please export your PyTorch model to ONNX format.',
      };
    }

    return {
      loaded: true,
      modelPath: this.modelPath,
      modelExists,
      preprocessorExists,
      preprocessor: this.preprocessor,
      inputNames: this.session.inputNames,
      outputNames: this.session.outputNames,
      message: 'ONNX model loaded and ready for inference',
    };
  }
}
