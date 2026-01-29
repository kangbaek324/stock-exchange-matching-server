import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, MessagePattern, Payload, RmqContext } from '@nestjs/microservices';
import { OrderService } from './order.service';

@Controller()
export class OrderController {
    constructor(private readonly orderService: OrderService) {}

    // @TODO MQData 안에 담겨있는 data 정보 타입을 DTO에서 type으로 교체해야함
    @EventPattern('order.created')
    async sendOrder(@Payload() mqData: any, @Ctx() context: RmqContext) {
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
