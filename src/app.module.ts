import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import * as Joi from "joi";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { database_config } from "./configs/configuration.config";

import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { GlobalExceptionFilter } from "./exception-filters/global-exception.filter";

import { AuthModule } from "@modules/auth/auth.module";
import { UsersModule } from "@modules/users/users.module";
import { PrismaModule } from "./prisma/prisma.module";
import { EmailModule } from "@modules/email/email.module";
import { DatasetsModule } from "@modules/datasets/datasets.module";
import { KmsModule } from "@modules/kms/kms.module";
import { ChartsModule } from "@modules/charts/charts.module";
import { AiModule } from "@modules/ai/ai.module";
import { ChartNotesModule } from "@modules/chart-notes/chart-notes.module";
import { ChartHistoryModule } from "@modules/chart-history/chart-history.module";
import { SystemModule } from "@modules/system/system.module";
import { ActivityModule } from "@modules/activity/activity.module";
import { ActivityAuditInterceptor } from "./interceptors/activity-audit.interceptor";
import { SubscriptionPlansModule } from "@modules/subscription-plans/subscription-plans.module";
import { PaymentsModule } from "@modules/payments/payments.module";
import { UploadModule } from "@modules/upload/upload.module";
import { ForecastsModule } from "@modules/forecasts/forecasts.module";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid("development", "production", "test", "provision")
          .default("development"),
        PORT: Joi.number().port().required(),
        DATABASE_URL: Joi.string().required(),
        JWT_ACCESS_TOKEN_EXPIRATION_TIME: Joi.number().required(),
        JWT_REFRESH_TOKEN_EXPIRATION_TIME: Joi.number().required(),
        // AI Cleaner (optional, service will throw if key missing when used)
        OPENROUTER_API_KEY: Joi.string().optional(),
        OPENAI_API_KEY: Joi.string().optional(),
        OPENAI_BASE_URL: Joi.string().uri().optional(),
        OPENAI_MODEL: Joi.string().optional(),
      }),
      validationOptions: {
        abortEarly: false,
      },
      load: [database_config],
      isGlobal: true,
      cache: true,
      expandVariables: true,
      envFilePath: process.env.NODE_ENV === "development" ? ".env.dev" : ".env",
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    EmailModule,
    DatasetsModule,
    KmsModule,
    ChartsModule,
    AiModule,
    ChartNotesModule,
    ChartHistoryModule,
    SystemModule,
    ActivityModule,
    SubscriptionPlansModule,
    PaymentsModule,
    UploadModule,
    ForecastsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ActivityAuditInterceptor,
    },
  ],
})
export class AppModule { }