import { Injectable } from '@nestjs/common';
import { Order, PrismaClient, TradingType } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { OrderExecutionService } from './order-execution.service';
import { orderToJson } from './utils/orders.util';
import { MqData, OrderAction } from './type/mq-data.type';
import { BuyOrder } from './type/buy.type';
import { CancelOrder } from './type/cancel.type';
import { EditOrder } from './type/edit.type';
import { SellOrder } from './type/sell.type';

@Injectable()
export class OrderService {
    constructor(
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

    async trade(data: BuyOrder | SellOrder, tradingType: TradingType) {
        let result;
        let accountUpdateList;

        await this.prismaService.$transaction(async (prisma: PrismaClient) => {
            // 계좌 ID 조회
            const account = await prisma.account.findUnique({
                where: { accountNumber: data.accountNumber },
                select: { id: true },
            });

            if (data.orderType == 'market') data.price = 0;

            // 주문 생성
            let submitOrder = await prisma.order.create({
                data: {
                    accountId: account.id,
                    stockId: data.stockId,
                    price: data.price,
                    number: data.number,
                    orderType: data.orderType,
                    tradingType: tradingType,
                },
            });

            // 체결 가능 주문 탐색
            accountUpdateList = await this.orderExecutionService.processSubmitOrder(
                prisma,
                data,
                submitOrder,
            );
        });

        // try {
        //     // 주식 가격 전송
        //     await this.websocket.stockUpdate(data.stockId);

        //     // 계좌, 주문 현황 업데이트 사항 전송 (웹소켓)
        //     for (const accountId of accountUpdateList) {
        //         await this.websocket.accountUpdate(accountId);
        //         await this.websocket.orderStatus(accountId);
        //     }

        //     // 주식을 보유한 사람들의 잔고 업데이트
        //     const userStocks = await this.prismaService.userStock.findMany({
        //         where: {
        //             stockId: data.stockId,
        //         },
        //     });

        //     for (let i = 0; i < userStocks.length; i++) {
        //         await this.websocket.accountUpdate(userStocks[i].accountId);
        //     }
        // } catch (err) {
        //     console.error('웹소켓 전송오류' + err);
        // }
    }

    /**
     * @TODO
     * 정정시 주문시 체결가능한 주식 탐색 로직 필요
     */
    async edit(data: EditOrder) {
        let order: Order, redisKey, beforeOrder;

        // 기존 주문 조회
        order = await this.prismaService.order.findUnique({
            where: { id: data.orderId },
        });

        redisKey =
            order.tradingType == 'buy'
                ? `orderbook:${order.stockId}:buy`
                : `orderbook:${order.stockId}:sell`;

        beforeOrder = orderToJson(order);

        // 주문 정정 (DB)
        order = await this.prismaService.order.update({
            data: {
                price: data.price,
            },
            where: {
                id: data.orderId,
            },
        });

        // 웹소켓 전송
        // try {
        //     await this.websocket.stockUpdate(order.stockId);
        //     await this.websocket.accountUpdate(order.accountId);
        //     await this.websocket.orderStatus(order.accountId);
        // } catch (err) {
        //     console.error('웹소켓 전송오류' + err);
        // }
    }

    async cancel(data: CancelOrder) {
        let order: Order;

        await this.prismaService.$transaction(async () => {
            // 주문 조회
            order = await this.prismaService.order.findFirst({
                where: { id: data.orderId },
            });

            // 주문 취소 (DB)
            order = await this.prismaService.order.update({
                data: {
                    status: 'c',
                },
                where: {
                    id: data.orderId,
                },
            });

            // 매도 주문일 경우 가능수량 수정
            if (order.tradingType == 'sell') {
                const userStock = await this.prismaService.userStock.findFirst({
                    where: {
                        stockId: order.stockId,
                        accountId: order.accountId,
                    },
                });

                await this.prismaService.userStock.update({
                    where: {
                        accountId_stockId: {
                            stockId: order.stockId,
                            accountId: order.accountId,
                        },
                    },
                    data: {
                        canNumber: userStock.canNumber + order.number - order.matchNumber,
                    },
                });
            }
        });

        // 웹소켓 전송
        // try {
        //     await this.websocket.stockUpdate(order.accountId);
        //     await this.websocket.accountUpdate(order.accountId);
        //     await this.websocket.orderStatus(order.accountId);
        // } catch (err) {
        //     console.error('웹소켓 전송오류' + err);
        // }
    }
}
