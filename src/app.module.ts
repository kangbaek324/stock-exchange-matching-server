import { Module } from '@nestjs/common';
import { OrderModule } from './order/order.module';
import { PrismaModule } from './common/prisma/prisma.module';

@Module({
    imports: [PrismaModule, OrderModule],
    controllers: [],
    providers: [],
})
export class AppModule {}
