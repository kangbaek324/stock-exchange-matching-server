import { MiddlewareConsumer, Module } from '@nestjs/common';
import { OrderModule } from './order/order.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { LoggerMiddleware } from './middlewares/logger.middleware';

@Module({
    imports: [PrismaModule, OrderModule],
    controllers: [],
    providers: [],
})
export class AppModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(LoggerMiddleware).forRoutes('*');
    }
}
