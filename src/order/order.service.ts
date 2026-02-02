import { Inject, Injectable } from '@nestjs/common';
import { Order, OrderStatus, OrderType, PrismaClient, TradingType } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { OrderExecutionService } from './order-execution.service';
import { MqData, OrderAction } from './type/mq-data.type';
import { BuyOrder } from './type/buy.type';
import { CancelOrder } from './type/cancel.type';
import { EditOrder } from './type/edit.type';
import { SellOrder } from './type/sell.type';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class OrderService {
    constructor(
        @Inject('ORDER_SERVICE') private client: ClientProxy,
        private readonly prismaService: PrismaService,
        private readonly orderExecutionService: OrderExecutionService,
    ) {}

    async sendOrder(mqData: MqData) {
        if (mqData.type === OrderAction.buy) {
            return await this.trade(mqData.data, 'buy');
        } else if (mqData.type === OrderAction.sell) {
            return await this.trade(mqData.data, 'sell');
        } else if (mqData.type === OrderAction.cancel) {
            return await this.cancel(mqData.data);
        } else if (mqData.type === OrderAction.edit) {
            return await this.edit(mqData.data);
        }
    }

    // 매수, 매도
    async trade(data: BuyOrder | SellOrder, tradingType: TradingType) {
        let updatedOrderIds: number[];

        await this.prismaService.$transaction(async (tx: PrismaClient) => {
            const accountId = (
                await tx.account.findUnique({
                    where: { accountNumber: data.accountNumber },
                    select: { id: true },
                })
            ).id;

            // 시장가 주문일 경우 0원으로 통일
            if (data.orderType == OrderType.market) data.price = 0n;

            // 주문 생성
            const submitOrder = await tx.order.create({
                data: {
                    accountId: accountId,
                    stockId: data.stockId,
                    price: data.price,
                    number: data.number,
                    orderType: data.orderType,
                    tradingType: tradingType,
                },
            });

            // 체결 가능 주문 탐색
            updatedOrderIds = await this.orderExecutionService.processSubmitOrder(tx, submitOrder);
        });

        this.client.emit('order.evented', {
            stockId: data.stockId,
            updatedOrderIds: updatedOrderIds,
        });
    }

    // @TODO 정정시 주문시 체결가능한 주식 탐색 로직 필요
    // 주문 정정
    async edit(data: EditOrder) {
        let order: Order;
        let updatedOrderIds: number[];

        await this.prismaService.$transaction(async (tx: PrismaClient) => {
            order = await this.prismaService.order.update({
                data: {
                    price: data.price,
                },
                where: {
                    id: data.orderId,
                },
            });

            updatedOrderIds = await this.orderExecutionService.processSubmitOrder(tx, order);
        });

        this.client.emit('order.evented', {
            stockId: order.stockId,
            updatedOrderIds: updatedOrderIds,
        });
    }

    // 주문 취소
    async cancel(data: CancelOrder) {
        let order: Order;

        await this.prismaService.$transaction(async () => {
            order = await this.prismaService.order.update({
                data: {
                    status: OrderStatus.c,
                },
                where: {
                    id: data.orderId,
                },
            });

            // 매도 주문일 경우 가능수량 수정
            if (order.tradingType == 'sell') {
                await this.prismaService.userStock.update({
                    where: {
                        accountId_stockId: {
                            stockId: order.stockId,
                            accountId: order.accountId,
                        },
                    },
                    data: {
                        canNumber: {
                            increment: order.number - order.matchNumber,
                        },
                    },
                });
            }
        });

        this.client.emit('order.evented', {
            stockId: order.stockId,
            updatedOrderIds: [order.id],
        });
    }
}
