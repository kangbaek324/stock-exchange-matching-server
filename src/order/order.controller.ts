import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { OrderService } from './order.service';
import { MqData } from './type/mq-data.type';

@Controller()
export class OrderController {
    constructor(private readonly orderService: OrderService) {}

    @EventPattern('order.created')
    async sendOrder(@Payload() mqData: MqData, @Ctx() context: RmqContext) {
        const channel = context.getChannelRef();
        const originalMsg = context.getMessage();

        try {
            await this.orderService.sendOrder(mqData);
        } catch (err) {
            console.error(err);
        } finally {
            channel.ack(originalMsg);
        }
    }
}
