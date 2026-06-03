import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      // ConfigModule is registered globally, so ConfigService is injectable
      // here without importing ConfigModule explicitly.
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProduction =
          config.get<string>('app.nodeEnv') === 'production';

        return {
          pinoHttp: {
            level: config.get<string>('app.logLevel') ?? 'info',
            redact: [
              'req.headers.authorization',
              'req.body.password',
              'req.body.refreshToken',
            ],
            // Pretty-print outside production; production emits raw JSON logs.
            ...(isProduction
              ? {}
              : {
                  transport: {
                    target: 'pino-pretty',
                    options: { singleLine: true },
                  },
                }),
          },
        };
      },
    }),
  ],
})
export class LoggingModule {}
