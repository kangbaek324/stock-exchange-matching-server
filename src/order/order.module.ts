import { Module } from '@nestjs/common';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { OrderExecutionService } from './order-execution.service';

@Module({
    controllers: [OrderController],
    providers: [OrderService, OrderExecutionService],
})
export class OrderModule {}
