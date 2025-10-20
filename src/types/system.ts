export interface HealthCheck {
    status: 'healthy' | 'unhealthy';
    message?: string;
    timestamp: string;
}

