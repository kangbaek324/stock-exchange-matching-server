import { Order, PrismaClient, TradingType, UserStock } from '@prisma/client';
import {
    orderCompleteUpdate,
    orderMatchAndRemainderUpdate,
    userStockDecrease,
    userStockIncrease,
} from './orders.util';

// submit == find
export async function handleEqualMatch(
    prisma: PrismaClient,
    submitOrder: Order,
    findOrder: Order,
    tradingType: TradingType,
    submitOrderNumber: bigint,
    findOrderNumber: bigint,
    userStockList: { update: number[] }, // accountId 저장
    userStocks: Map<number, UserStock>, // accountId, user_stocks 객체
): Promise<[{ update: number[] }, Map<number, UserStock>]> {
    const increaseNumber = submitOrderNumber;
    const decreaseNumber = findOrderNumber;

    // 잔고 수정
    if (tradingType == 'buy') {
        [userStockList, userStocks] = await userStockIncrease(
            prisma,
            submitOrder.stockId,
            submitOrder.accountId,
            increaseNumber,
            userStockList,
            userStocks,
            findOrder.price,
        );

        [userStockList, userStocks] = await userStockDecrease(
            prisma,
            findOrder.stockId,
            findOrder.accountId,
            decreaseNumber,
            userStockList,
            userStocks,
        );
    } else {
        [userStockList, userStocks] = await userStockDecrease(
            prisma,
            submitOrder.stockId,
            submitOrder.accountId,
            decreaseNumber,
            userStockList,
            userStocks,
        );

        [userStockList, userStocks] = await userStockIncrease(
            prisma,
            findOrder.stockId,
            findOrder.accountId,
            increaseNumber,
            userStockList,
            userStocks,
            findOrder.price,
        );
    }

    return [userStockList, userStocks];
}

// submit < find
export async function handleRemainingMatch(
    prisma: PrismaClient,
    submitOrder: Order,
    findOrder: Order,
    tradingType: TradingType,
    submitOrderNumber: bigint,
    userStockList: { update: number[] }, // accountId 저장
    userStocks: Map<number, UserStock>, // accountId, user_stocks 객체
): Promise<[{ update: number[] }, Map<number, UserStock>]> {
    const increaseNumber = submitOrderNumber;
    const decreaseNumber = submitOrderNumber;

    // 잔고 수정
    if (tradingType == 'buy') {
        [userStockList, userStocks] = await userStockIncrease(
            prisma,
            submitOrder.stockId,
            submitOrder.accountId,
            increaseNumber,
            userStockList,
            userStocks,
            findOrder.price,
        );

        [userStockList, userStocks] = await userStockDecrease(
            prisma,
            findOrder.stockId,
            findOrder.accountId,
            decreaseNumber,
            userStockList,
            userStocks,
        );
    } else {
        [userStockList, userStocks] = await userStockDecrease(
            prisma,
            submitOrder.stockId,
            submitOrder.accountId,
            decreaseNumber,
            userStockList,
            userStocks,
        );

        [userStockList, userStocks] = await userStockIncrease(
            prisma,
            findOrder.stockId,
            findOrder.accountId,
            increaseNumber,
            userStockList,
            userStocks,
            findOrder.price,
        );
    }

    return [userStockList, userStocks];
}

// submit > find
export async function handlePartialMatch(
    prisma: PrismaClient,
    submitOrder: Order,
    findOrder: Order,
    tradingType: TradingType,
    findOrderNumber: bigint,
    userStockList: { update: number[] }, // accountId 저장
    userStocks: Map<number, UserStock>, // accountId, user_stocks 객체
): Promise<[{ update: number[] }, Map<number, UserStock>]> {
    const order = [findOrder];
    const increaseNumber = findOrderNumber;
    const decreaseNumber = findOrderNumber;

    // 잔고 수정
    if (tradingType == 'buy') {
        [userStockList, userStocks] = await userStockIncrease(
            prisma,
            submitOrder.stockId,
            submitOrder.accountId,
            increaseNumber,
            userStockList,
            userStocks,
            findOrder.price,
        );

        [userStockList, userStocks] = await userStockDecrease(
            prisma,
            findOrder.stockId,
            findOrder.accountId,
            decreaseNumber,
            userStockList,
            userStocks,
        );
    } else {
        [userStockList, userStocks] = await userStockDecrease(
            prisma,
            submitOrder.stockId,
            submitOrder.accountId,
            decreaseNumber,
            userStockList,
            userStocks,
        );

        [userStockList, userStocks] = await userStockIncrease(
            prisma,
            findOrder.stockId,
            findOrder.accountId,
            increaseNumber,
            userStockList,
            userStocks,
            findOrder.price,
        );
    }

    await orderCompleteUpdate(prisma, order, findOrder.number);
    await orderMatchAndRemainderUpdate(prisma, submitOrder, findOrder);

    return [userStockList, userStocks];
}
