import { Injectable, Logger, HttpException, HttpStatus, Inject, forwardRef } from '@nestjs/common';
import { ForecastsService } from './forecasts.service';
import { DatasetsService } from '../datasets/datasets.service';
import { AiService } from '../ai/ai.service';
import { AiChartEvaluationService } from '../ai/ai.chart-evaluation.service';
import { ForecastDto } from '../ai/dto/forecast.dto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ForecastProcessingService {
  private readonly logger = new Logger(ForecastProcessingService.name);

  constructor(
    private readonly forecastsService: ForecastsService,
    private readonly datasetsService: DatasetsService,
    @Inject(forwardRef(() => AiService))
    private readonly aiService: AiService,
    @Inject(forwardRef(() => AiChartEvaluationService))
    private readonly aiChartEvaluationService: AiChartEvaluationService,
  ) { }

  /**
   * Process and create a forecast from DTO
   */
  async processForecast(dto: ForecastDto, userId: string) {
    // 1. Prepare CSV data
    const csvData = await this.prepareCsvData(dto, userId);

    // 2. Execute forecast
    const result = await this.aiService.forecast({
      csvData,
      targetColumn: dto.targetColumn,
      featureColumns: dto.featureColumns,
      modelType: dto.modelType,
      forecastWindow: dto.forecastWindow,
    });

    // 3. Validate forecast results
    if (!result.forecastData || !result.forecastData.predictions || !Array.isArray(result.forecastData.predictions)) {
      throw new HttpException(
        'Forecast failed: No predictions generated',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // 4. Save forecast to database (will throw if fails)
    let savedForecast;
    try {
      savedForecast = await this.saveForecast(dto, result, userId);
    } catch (error: any) {
      this.logger.error(`[processForecast] Failed to save forecast: ${error.message}`);
      // If saving fails, nothing to rollback - just throw
      throw error;
    }

    if (!savedForecast) {
      throw new HttpException(
        'Failed to save forecast to database',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // 5. Analyze chart with Gemini (optional - forecast can succeed without analysis)
    // Controlled by dto.runAnalysisAfterForecast (default: true when undefined)
    const shouldAnalyze = dto.runAnalysisAfterForecast !== false;

    // If analysis fails due to rate limits, we still return the forecast without analysis
    if (shouldAnalyze && result.chartImageUrl) {
      this.logger.log(`[processForecast] Starting Gemini analysis for forecast ${savedForecast.id}`);
      this.logger.log(`[processForecast] Chart image URL: ${result.chartImageUrl}`);

      try {
        const analysis = await this.aiChartEvaluationService.analyzeForecastChart(
          savedForecast.id,
          result.chartImageUrl,
          1, // Only 1 attempt during forecast creation
        );

        if (analysis) {
          this.logger.log(`[processForecast] Analysis received (${analysis.length} chars), saving to database...`);
          try {
            await this.forecastsService.update(
              savedForecast.id,
              { analyze: analysis },
              '', // userId not needed for internal updates
            );
            this.logger.log(`[processForecast] ✅ Analysis saved successfully for forecast ${savedForecast.id}`);
            // Update savedForecast with analysis for response
            savedForecast.analyze = analysis;
          } catch (updateError: any) {
            this.logger.warn(`[processForecast] Failed to save analysis to database: ${updateError.message}`);
            // Don't fail the entire forecast if analysis save fails
          }
        } else {
          this.logger.warn(`[processForecast] ⚠️ No analysis returned from Gemini (may be rate-limited)`);
        }
      } catch (error: any) {
        // Check if it's a rate limit error (429)
        const isRateLimit = error.message?.includes('429') || 
                           error.message?.includes('rate limit') || 
                           error.message?.includes('rate-limited');
        
        if (isRateLimit) {
          this.logger.warn(
            `[processForecast] ⚠️ Gemini API rate-limited for forecast ${savedForecast.id}. Forecast will be created without analysis.`
          );
          // Don't throw - allow forecast to succeed without analysis
        } else {
          this.logger.error(
            `[processForecast] ❌ Error analyzing forecast ${savedForecast.id}: ${error.message}`
          );
          // For non-rate-limit errors, log but don't fail the forecast
          // Analysis is optional, forecast is still valid
        }
      }
    } else if (!shouldAnalyze) {
      this.logger.log(
        `[processForecast] Skipping analysis for forecast ${savedForecast.id} (runAnalysisAfterForecast=false)`,
      );
    } else {
      this.logger.warn(`[processForecast] Cannot analyze chart: chartImageUrl is missing`);
      // Don't fail - forecast is still valid without analysis
    }

    // 6. Return formatted response (with analysis if available)
    const response = {
      predictions: result.forecastData.predictions,
      metrics: result.forecastData.metrics || null,
      modelType: result.forecastData.modelType || null,
      forecastWindow: result.forecastData.forecastWindow || null,
      forecastId: savedForecast?.id || null,
      analyze: savedForecast?.analyze || null, // Include analysis if available
      featureColumns: savedForecast?.featureColumns || [], // Include featureColumns
    };
    return response;
  }

  /**
   * Prepare CSV data from dataset or use provided CSV
   */
  private async prepareCsvData(dto: ForecastDto, userId: string): Promise<string> {
    // If CSV data is provided, use it directly
    if (dto.csvData) {
      return dto.csvData;
    }

    // Otherwise, fetch dataset and convert to CSV
    if (!dto.datasetId) {
      throw new HttpException(
        'CSV data is required. Please provide either csvData or datasetId',
        HttpStatus.BAD_REQUEST,
      );
    }

    const dataset = await this.datasetsService.findOne(dto.datasetId, userId);

    // Validate target column is numeric
    if (dto.targetColumn) {
      const targetHeader = dataset.headers.find(h => h.name === dto.targetColumn);
      if (!targetHeader) {
        throw new HttpException(
          `Target column "${dto.targetColumn}" not found in dataset`,
          HttpStatus.BAD_REQUEST,
        );
      }
      if (targetHeader.type !== 'number') {
        throw new HttpException(
          `Target column "${dto.targetColumn}" must be numeric. Found type: ${targetHeader.type}. Only numeric columns can be forecasted.`,
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    return this.convertDatasetToCSV(dataset);
  }

  /**
   * Convert dataset to CSV format
   */
  private convertDatasetToCSV(dataset: any): string {
    if (!dataset || !dataset.headers || dataset.headers.length === 0) {
      return '';
    }

    const rowCount = dataset.headers[0]?.data?.length || 0;
    const rows: string[] = [];

    // Helper function to escape CSV values (for both headers and data)
    // Always quote all values to ensure proper CSV parsing by pandas
    const escapeCsvValue = (value: any): string => {
      if (value === null || value === undefined) {
        return '""';
      }
      const strValue = String(value);
      // Always quote to ensure proper parsing, especially for column names with commas
      return `"${strValue.replace(/"/g, '""')}"`;
    };

    // Header row - properly escape column names
    const columnNames = dataset.headers.map((h: any) => escapeCsvValue(h.name));
    rows.push(columnNames.join(','));

    // Data rows
    for (let i = 0; i < rowCount; i++) {
      const row = dataset.headers.map((h: any) => {
        const value = h.data?.[i] ?? '';
        return escapeCsvValue(value);
      });
      rows.push(row.join(','));
    }

    return rows.join('\n');
  }

  /**
   * Save forecast to database
   */
  private async saveForecast(
    dto: ForecastDto,
    result: { forecastData?: any; chartImageUrl?: string | null },
    userId: string,
  ) {
    try {
      return await this.forecastsService.create(
        {
          name: dto.forecastName,
          datasetId: dto.datasetId,
          targetColumn: dto.targetColumn || 'Unknown',
          featureColumns: dto.featureColumns || [],
          forecastWindow: result.forecastData?.forecastWindow || dto.forecastWindow || 30,
          modelType: result.forecastData?.modelType || dto.modelType || 'Unknown',
          predictions: result.forecastData.predictions,
          metrics: result.forecastData.metrics || undefined,
          chartImageUrl: result.chartImageUrl || null,
        },
        userId,
      );
    } catch (error: any) {
      this.logger.error(`[saveForecast] Failed to save forecast: ${error.message}`);
      // Throw error - will be caught by processForecast
      throw error;
    }
  }

  /**
   * Rollback forecast: Delete forecast record and chart image
   * Returns true if rollback was successful, false if forecast was already deleted
   */
  private async rollbackForecast(forecastId: string, chartImageUrl: string | null): Promise<boolean> {
    this.logger.log(`[rollbackForecast] Rolling back forecast ${forecastId}`);

    try {
      // Check if forecast exists before trying to delete
      try {
        await this.forecastsService.remove(forecastId, '');
        this.logger.log(`[rollbackForecast] ✅ Forecast ${forecastId} deleted from database`);
      } catch (removeError: any) {
        // If forecast doesn't exist, it might have been already deleted
        if (removeError.message?.includes('not found') || removeError.message?.includes('Not found')) {
          this.logger.warn(`[rollbackForecast] Forecast ${forecastId} was already deleted, skipping database deletion`);
          return false;
        }
        // Re-throw other errors
        throw removeError;
      }

      // Delete chart image if it exists
      if (chartImageUrl) {
        try {
          const imagePath = chartImageUrl.startsWith('/')
            ? chartImageUrl.substring(1)
            : chartImageUrl;

          // Resolve project root (same method as ai.chart-evaluation.service.ts)
          const isProduction = __dirname.includes('dist');
          const baseDir = isProduction
            ? path.join(__dirname, '..', '..', '..', 'src', 'modules', 'ai')
            : __dirname;
          const scriptPath = path.join(baseDir, 'ai-model', 'AI_Training.py');
          const scriptDir = path.dirname(scriptPath);
          const projectRoot = path.resolve(scriptDir, '..', '..', '..', '..');
          const fullImagePath = path.join(projectRoot, 'public', imagePath);

          if (fs.existsSync(fullImagePath)) {
            await fs.promises.unlink(fullImagePath);
            this.logger.log(`[rollbackForecast] ✅ Chart image deleted: ${fullImagePath}`);
          } else {
            this.logger.warn(`[rollbackForecast] Chart image not found at ${fullImagePath}, may have been already deleted`);
          }
        } catch (imageError: any) {
          this.logger.warn(`[rollbackForecast] Failed to delete chart image: ${imageError.message}`);
          // Don't throw - image deletion failure is not critical
        }
      }

      return true;
    } catch (error: any) {
      this.logger.error(`[rollbackForecast] ❌ Failed to rollback forecast ${forecastId}: ${error.message}`);
      // Don't throw - rollback failure shouldn't crash the process
      return false;
    }
  }
}

