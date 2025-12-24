import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ResourceWarningCronService } from '../src/modules/users/resource-warning-cron.service';

async function main() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const svc = app.get(ResourceWarningCronService);
    try {
        console.log('Starting resource-warning job...');
        await svc.handleResourceWarnings();
        console.log('Resource-warning job completed');
    } catch (err) {
        console.error('Resource-warning job failed', err);
        process.exitCode = 1;
    } finally {
        await app.close();
    }
}

main();
