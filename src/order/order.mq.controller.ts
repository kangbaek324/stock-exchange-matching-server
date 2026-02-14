import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { OrderService } from './order.service';
import { OrderCreatedData } from './type/order-created-data.type';

@Controller()
export class OrderMqController {
    constructor(private readonly orderService: OrderService) {}

    @EventPattern('order.created')
    async sendOrder(@Payload() mqData: OrderCreatedData, @Ctx() context: RmqContext) {
        const channel = context.getChannelRef();
        const originalMsg = context.getMessage();

        await this.orderService.sendOrder(mqData);
        channel.ack(originalMsg);
    }
}
