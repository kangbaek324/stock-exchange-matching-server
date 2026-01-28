import { Injectable } from '@nestjs/common';
import { BuyDto } from './dto/buy.dto';
import { SellDto } from './dto/sell.dto';
import { Order, PrismaClient, TradingType, UserStock } from '@prisma/client';
import * as utils from './utils/orders.util';
import { handleEqualMatch, handlePartialMatch } from './utils/handleMatch';
import { handleRemainingMatch } from './utils/handleMatch';

@Injectable()
export class OrderExecutionService {
    // 체결 가능 주문 탐색
    async findOrder(prisma: PrismaClient, data: BuyDto | SellDto, tradingType: TradingType) {
        const stockId = data.stockId;
        const orderType = data.orderType;
        const price = data.price;

        const where: any = {
            stockId: stockId,
            tradingType: tradingType === 'buy' ? 'sell' : 'buy',
            status: 'n',
        };

        if (orderType === 'limit') {
            if (tradingType === 'buy') where.price = { lte: price };
            else if (tradingType === 'sell') where.price = { gte: price };
        }

        return await prisma.order.findFirst({
            where,
            orderBy: [{ price: tradingType === 'buy' ? 'asc' : 'desc' }, { createdAt: 'asc' }],
            take: 1,
        });
    }

    // 체결이 끝난후 후 처리
    async finalizeTradeResult(
        prisma: PrismaClient,
        data: BuyDto | SellDto,
        userStockList: { update: number[] },
        userStocks: Map<number, UserStock>,
        createMatchList,
        nextStockPrice: bigint,
    ) {
        // 주식 가격 업데이트
        await utils.stockPriceUpdate(prisma, data, nextStockPrice);

        // 체결 로그 업데이트
        await prisma.orderMatch.createMany({ data: createMatchList });

        // 계좌 잔고 업데이트
        for (const accountId of userStockList.update) {
            await prisma.userStock.update({
                where: {
                    accountId_stockId: {
                        accountId: accountId,
                        stockId: data.stockId,
                    },
                },
                data: userStocks.get(accountId),
            });
        }
    }

    async processSubmitOrder(prisma: PrismaClient, data: BuyDto | SellDto, submitOrder: Order) {
        const tradingType = submitOrder.tradingType;

        let findOrder: Order, nextStockPrice: bigint;
        let createMatchList = [];

        // 웹소켓을 보내야 하는 계좌 리스트
        const accountUpdateList = [submitOrder.accountId];
        const isInAccountUpdateList = new Map<number, boolean>();

        isInAccountUpdateList.set(submitOrder.accountId, true);

        let userStockList: { update: number[] } = { update: [] }; // accountId 저장
        let userStocks = new Map<number, UserStock>(); // accountId, user_stocks 객체, 이름 stocks로 바꿔야됨

        // 메모리에 제출한 주문 등록
        if (!userStocks.get(submitOrder.accountId)) {
            const userStockForSubmitOrder = await prisma.userStock.findUnique({
                where: {
                    accountId_stockId: {
                        accountId: submitOrder.accountId,
                        stockId: submitOrder.stockId,
                    },
                },
            });

            userStocks.set(submitOrder.accountId, userStockForSubmitOrder);
        }

        while (true) {
            // 체결할 주문 찾기
            findOrder = await this.findOrder(prisma, data, tradingType);
            // 체결할 주문이 있다면
            if (findOrder) {
                // 찾은 주문 메모리에 저장
                if (!userStocks.get(findOrder.accountId)) {
                    const userStockForFindOrder = await prisma.userStock.findUnique({
                        where: {
                            accountId_stockId: {
                                accountId: findOrder.accountId,
                                stockId: findOrder.stockId,
                            },
                        },
                    });

                    userStocks.set(findOrder.accountId, userStockForFindOrder);
                }

                // 체결 가능한 수량
                const submitOrderNumber = submitOrder.number - submitOrder.matchNumber;
                const findOrderNumber = findOrder.number - findOrder.matchNumber;

                // 체결
                if (submitOrderNumber == findOrderNumber) {
                    const order = [findOrder, submitOrder];

                    [userStockList, userStocks] = await handleEqualMatch(
                        prisma,
                        submitOrder,
                        findOrder,
                        tradingType,
                        submitOrderNumber,
                        findOrderNumber,
                        userStockList,
                        userStocks,
                    );

                    await utils.orderCompleteUpdate(prisma, order);
                    createMatchList.push(utils.createOrderMatch(data, submitOrder, findOrder));
                    nextStockPrice = findOrder.price;

                    if (!isInAccountUpdateList.get(findOrder.accountId)) {
                        accountUpdateList.push(findOrder.accountId);

                        isInAccountUpdateList.set(findOrder.accountId, true);
                    }

                    break;
                } else if (submitOrderNumber < findOrderNumber) {
                    const order = [submitOrder];

                    [userStockList, userStocks] = await handleRemainingMatch(
                        prisma,
                        submitOrder,
                        findOrder,
                        tradingType,
                        submitOrderNumber,
                        userStockList,
                        userStocks,
                    );

                    await utils.orderCompleteUpdate(prisma, order, submitOrder.number);
                    await utils.orderMatchAndRemainderUpdate(prisma, findOrder, submitOrder);
                    createMatchList.push(utils.createOrderMatch(data, submitOrder, findOrder));
                    findOrder.matchNumber =
                        findOrder.matchNumber + (submitOrder.number - submitOrder.matchNumber);

                    nextStockPrice = findOrder.price;

                    if (!isInAccountUpdateList.get(findOrder.accountId)) {
                        accountUpdateList.push(findOrder.accountId);

                        isInAccountUpdateList.set(findOrder.accountId, true);
                    }

                    break;
                } else if (submitOrderNumber > findOrderNumber) {
                    [userStockList, userStocks] = await handlePartialMatch(
                        prisma,
                        submitOrder,
                        findOrder,
                        tradingType,
                        findOrderNumber,
                        userStockList,
                        userStocks,
                    );

                    createMatchList.push(
                        utils.createOrderMatch(data, submitOrder, findOrder, true),
                    );
                    nextStockPrice = findOrder.price;

                    if (!isInAccountUpdateList.get(findOrder.accountId)) {
                        accountUpdateList.push(findOrder.accountId);

                        isInAccountUpdateList.set(findOrder.accountId, true);
                    }

                    submitOrder.matchNumber =
                        submitOrder.matchNumber + (findOrder.number - findOrder.matchNumber);
                }
            } else {
                // 체결할 주문이 없다면
                // 더이상 체결할 주문이 없거나 / 즉시 체결가능한 주문이 없는경우

                if (!nextStockPrice) {
                    const stock = await prisma.stock.findUnique({
                        where: { id: data.stockId },
                    });

                    nextStockPrice = stock.price;
                }

                // 유저가 가진 주식 조회
                let userStock = userStocks.get(submitOrder.accountId);
                if (!userStock) {
                    userStock = await prisma.userStock.findUnique({
                        where: {
                            accountId_stockId: {
                                accountId: submitOrder.accountId,
                                stockId: submitOrder.stockId,
                            },
                        },
                    });
                }

                // 시장가 주문중 미체결이 있는 경우
                if (
                    submitOrder.number != submitOrder.matchNumber &&
                    submitOrder.orderType == 'market'
                ) {
                    // DB 취소
                    await prisma.order.update({
                        where: { id: submitOrder.id },
                        data: {
                            status: 'c',
                        },
                    });

                    break;
                }

                // 매도 주문시 가능수량 업데이트
                if (tradingType == 'sell') {
                    userStock.canNumber =
                        userStock.canNumber - (submitOrder.number - submitOrder.matchNumber);
                    userStocks.set(submitOrder.accountId, userStock);

                    userStockList.update.push(submitOrder.accountId);
                }

                break;
            }
        }

        // 후처리
        await this.finalizeTradeResult(
            prisma,
            data,
            userStockList,
            userStocks,
            createMatchList,
            nextStockPrice,
        );

        return accountUpdateList;
    }
}
