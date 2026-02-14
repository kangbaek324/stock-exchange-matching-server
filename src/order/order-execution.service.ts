import { Injectable } from '@nestjs/common';
import {
    Order,
    OrderStatus,
    OrderType,
    PrismaClient,
    TradingType,
    UserStock,
} from '@prisma/client';
import { OrderUtilService } from './services/order-util.service';
import { HandleMatchService } from './services/handle-match.service';

@Injectable()
export class OrderExecutionService {
    constructor(
        private readonly orderUtilService: OrderUtilService,
        private readonly handleMatchService: HandleMatchService,
    ) {}

    // 체결 가능 주문 탐색
    async findOrder(tx: PrismaClient, submitOrder: Order, tradingType: TradingType) {
        const stockId = submitOrder.stockId;
        const orderType = submitOrder.orderType;
        const price = submitOrder.price;

        let where = {
            stockId: stockId,
            tradingType: tradingType === TradingType.buy ? TradingType.sell : TradingType.buy,
            status: OrderStatus.n,
            price: {},
        };

        if (orderType === OrderType.limit) {
            if (tradingType === TradingType.buy) where.price = { lte: price };
            else if (tradingType === TradingType.sell) where.price = { gte: price };
        }

        return await tx.order.findFirst({
            where,
            orderBy: [
                { price: tradingType === TradingType.buy ? 'asc' : 'desc' },
                { createdAt: 'asc' },
            ],
            take: 1,
        });
    }

    // 체결이 끝난후 후 처리
    async finalizeTradeResult(
        tx: PrismaClient,
        stockId: number,
        userStockList: { update: number[] },
        userStocks: Map<number, UserStock>,
        createMatchList,
        nextStockPrice: bigint,
    ) {
        // 주식 가격 업데이트
        await this.orderUtilService.stockPriceUpdate(tx, stockId, nextStockPrice);

        // 체결 로그 업데이트
        await tx.orderMatch.createMany({ data: createMatchList });

        // 계좌 잔고 업데이트
        for (const accountId of [...new Set(userStockList.update)]) {
            const userStock = userStocks.get(accountId);
            await tx.userStock.update({
                where: {
                    accountId_stockId: {
                        accountId: accountId,
                        stockId: stockId,
                    },
                },
                data: {
                    number: userStock.number,
                    canNumber: userStock.canNumber,
                    average: userStock.average,
                    totalBuyAmount: userStock.totalBuyAmount,
                },
            });
        }
    }

    async processSubmitOrder(tx: PrismaClient, submitOrder: Order) {
        const stockId = submitOrder.stockId;
        const tradingType = submitOrder.tradingType;

        let nextStockPrice: bigint;
        let createMatchList = [];

        let updatedOrders: { id: number; accountId: number }[] = [];
        updatedOrders.push({
            id: submitOrder.id,
            accountId: submitOrder.accountId,
        });

        // Update를 마지막에 한번만 하기 위해 정보를 메모리에 저장해두는 변수
        let userStockList: { update: number[] } = { update: [] }; // 업데이트 해야하는 accountId 저장
        let userStocks = new Map<number, UserStock>(); // accountId, userStocks 객체

        // 메모리에 주문 계좌의 주식 보유 현황 저장
        if (!userStocks.get(submitOrder.accountId)) {
            const result = await tx.$queryRaw<UserStock[]>`
                SELECT account_id AS accountId, stock_id AS stockId,
                       number, can_number AS canNumber, average,
                       total_buy_amount AS totalBuyAmount
                FROM user_stocks
                WHERE account_id = ${submitOrder.accountId} AND stock_id = ${stockId}
                FOR UPDATE
            `;

            userStocks.set(submitOrder.accountId, result[0] ?? null);
        }

        while (true) {
            // 체결할 주문 찾기
            let findOrder = await this.findOrder(tx, submitOrder, tradingType);

            // 체결할 주문이 있다면
            if (findOrder) {
                updatedOrders.push({
                    id: findOrder.id,
                    accountId: findOrder.accountId,
                });

                // 찾은 주문 메모리에 저장
                if (!userStocks.get(findOrder.accountId)) {
                    const result = await tx.$queryRaw<UserStock[]>`
                        SELECT account_id AS accountId, stock_id AS stockId,
                               number, can_number AS canNumber, average,
                               total_buy_amount AS totalBuyAmount
                        FROM user_stocks
                        WHERE account_id = ${findOrder.accountId} AND stock_id = ${findOrder.stockId}
                        FOR UPDATE
                    `;

                    userStocks.set(findOrder.accountId, result[0] ?? null);
                }

                // 체결 가능한 수량
                const submitRemaining = this.orderUtilService.getRemaining(submitOrder);
                const findRemaining = this.orderUtilService.getRemaining(findOrder);

                // 체결
                if (submitRemaining === findRemaining) {
                    const order = [findOrder, submitOrder];

                    [userStockList, userStocks] = await this.handleMatchService.handleEqualMatch(
                        tx,
                        submitOrder,
                        findOrder,
                        tradingType,
                        submitRemaining,
                        findRemaining,
                        userStockList,
                        userStocks,
                    );

                    await this.orderUtilService.orderCompleteUpdate(tx, order);
                    createMatchList.push(
                        this.orderUtilService.createOrderMatch(
                            submitOrder,
                            findOrder,
                            submitRemaining,
                            findRemaining,
                        ),
                    );
                    nextStockPrice = findOrder.price;

                    break;
                } else if (submitRemaining < findRemaining) {
                    const order = [submitOrder];

                    [userStockList, userStocks] =
                        await this.handleMatchService.handleRemainingMatch(
                            tx,
                            submitOrder,
                            findOrder,
                            tradingType,
                            submitRemaining,
                            userStockList,
                            userStocks,
                        );

                    await this.orderUtilService.orderCompleteUpdate(tx, order, submitOrder.number);
                    await this.orderUtilService.orderMatchAndRemainderUpdate(
                        tx,
                        findOrder,
                        submitOrder,
                    );
                    createMatchList.push(
                        this.orderUtilService.createOrderMatch(
                            submitOrder,
                            findOrder,
                            submitRemaining,
                            findRemaining,
                        ),
                    );

                    nextStockPrice = findOrder.price;

                    break;
                } else if (submitRemaining > findRemaining) {
                    [userStockList, userStocks] = await this.handleMatchService.handlePartialMatch(
                        tx,
                        submitOrder,
                        findOrder,
                        tradingType,
                        findRemaining,
                        userStockList,
                        userStocks,
                    );

                    createMatchList.push(
                        this.orderUtilService.createOrderMatch(
                            submitOrder,
                            findOrder,
                            submitRemaining,
                            findRemaining,
                        ),
                    );
                    nextStockPrice = findOrder.price;

                    submitOrder.matchNumber =
                        submitOrder.matchNumber + (findOrder.number - findOrder.matchNumber);
                }
            } else {
                // 체결할 주문이 없다면
                // 더이상 체결할 주문이 없거나 / 즉시 체결가능한 주문이 없는경우

                if (!nextStockPrice) {
                    const stock = await tx.stock.findUnique({
                        where: { id: stockId },
                    });

                    nextStockPrice = stock.price;
                }

                // 시장가 주문중 미체결이 있는 경우
                if (
                    submitOrder.number !== submitOrder.matchNumber &&
                    submitOrder.orderType == OrderType.market
                ) {
                    await tx.order.update({
                        where: { id: submitOrder.id },
                        data: {
                            status: OrderStatus.c,
                        },
                    });

                    if (submitOrder.tradingType === TradingType.sell) {
                        await tx.userStock.update({
                            where: {
                                accountId_stockId: {
                                    accountId: submitOrder.accountId,
                                    stockId: stockId,
                                },
                            },
                            data: {
                                canNumber: {
                                    increment: submitOrder.number - submitOrder.matchNumber,
                                },
                            },
                        });
                    }
                }

                break;
            }
        }

        // 후처리
        await this.finalizeTradeResult(
            tx,
            stockId,
            userStockList,
            userStocks,
            createMatchList,
            nextStockPrice,
        );

        return updatedOrders;
    }
}
