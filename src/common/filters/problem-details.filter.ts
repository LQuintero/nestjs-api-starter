import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma';
import { ProblemDetails } from '../problem-details/problem-details.types';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();
    const problem = this.toProblemDetails(exception, request);

    // Log unexpected errors (anything resolving to a 500) with stack and
    // request context. We deliberately avoid logging request bodies/headers to
    // prevent leaking credentials or other sensitive data.
    if (problem.status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}` +
          (problem.traceId ? ` (traceId=${problem.traceId})` : ''),
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response
      .status(problem.status)
      .type('application/problem+json')
      .json(problem);
  }

  private toProblemDetails(
    exception: unknown,
    request: Request & { id?: string },
  ): ProblemDetails {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        type: `https://httpstatuses.com/${status}`,
        title: exception.name,
        status,
        detail: this.extractMessage(exception.getResponse()),
        instance: request.url,
        traceId: request.id,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          type: 'https://httpstatuses.com/409',
          title: 'Conflict',
          status: HttpStatus.CONFLICT,
          detail: 'A record with this unique value already exists.',
          instance: request.url,
          traceId: request.id,
        };
      }

      if (exception.code === 'P2025') {
        return {
          type: 'https://httpstatuses.com/404',
          title: 'Not Found',
          status: HttpStatus.NOT_FOUND,
          detail: 'The requested record was not found.',
          instance: request.url,
          traceId: request.id,
        };
      }
    }

    return {
      type: 'https://httpstatuses.com/500',
      title: 'Internal Server Error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: 'An unexpected error occurred.',
      instance: request.url,
      traceId: request.id,
    };
  }

  private extractMessage(response: string | object): string | undefined {
    if (typeof response === 'string') {
      return response;
    }

    if ('message' in response) {
      const message = (response as { message: unknown }).message;
      return Array.isArray(message) ? message.join(', ') : String(message);
    }

    return undefined;
  }
}
