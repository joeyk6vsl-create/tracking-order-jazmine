import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { ZodError } from 'zod';
import type { FastifyReply } from 'fastify';

export class AppError extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status = 400,
  ) {
    super({ code, message }, status);
  }
}
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 429) {
      reply
        .status(429)
        .send({ code: 'RATE_LIMITED', message: 'ทำรายการถี่เกินไป กรุณารอสักครู่แล้วลองใหม่' });
      return;
    }
    if (error instanceof AppError) {
      reply.status(error.getStatus()).send(error.getResponse());
      return;
    }
    if (error instanceof ZodError) {
      reply
        .status(400)
        .send({ code: 'INVALID_INPUT', message: error.issues[0]?.message ?? 'กรุณาตรวจข้อมูล' });
      return;
    }
    if (error instanceof HttpException) {
      reply
        .status(error.getStatus())
        .send({ code: 'REQUEST_REJECTED', message: 'ไม่สามารถดำเนินการตามคำขอได้' });
      return;
    }
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      reply.status(409).send({ code: 'DUPLICATE_USERNAME', message: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' });
      return;
    }
    reply.log.error({ requestId: reply.request.id }, 'Unhandled application error');
    reply.status(500).send({
      code: 'INTERNAL_ERROR',
      message: 'ระบบขัดข้อง กรุณาลองอีกครั้ง',
      requestId: reply.request.id,
    });
  }
}
