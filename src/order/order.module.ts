import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderExecutionService } from './order-execution.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { OrderMqController } from './order.mq.controller';

@Module({
    imports: [
        ClientsModule.register([
            {
                name: 'ORDER_SERVICE',
                transport: Transport.RMQ,
                options: {
                    urls: ['amqp://localhost:5672'],
                    queue: 'order_event_queue',
                    queueOptions: {
                        durable: true,
                    },
                    persistent: true,
                },
            },
        ]),
    ],
    controllers: [OrderMqController],
    providers: [OrderService, OrderExecutionService],
})
export class OrderModule {}
