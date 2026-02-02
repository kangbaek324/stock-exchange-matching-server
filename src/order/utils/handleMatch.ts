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
    userStockList: { update: number[] },
    userStocks: Map<number, UserStock>,
): Promise<[{ update: number[] }, Map<number, UserStock>]> {
    const increaseNumber = submitOrderNumber;
    const decreaseNumber = findOrderNumber;

    const stockId = submitOrder.stockId;
    const submitOrderAccountId = submitOrder.accountId;
    const findOrderAccountId = findOrder.accountId;

    // 잔고 수정
    if (tradingType === TradingType.buy) {
        [userStockList, userStocks] = await userStockIncrease(
            prisma,
            stockId,
            submitOrderAccountId,
            increaseNumber,
            userStockList,
            userStocks,
            findOrder.price,
        );

        [userStockList, userStocks] = await userStockDecrease(
            prisma,
            stockId,
            findOrderAccountId,
            decreaseNumber,
            userStockList,
            userStocks,
        );
    } else {
        [userStockList, userStocks] = await userStockDecrease(
            prisma,
            stockId,
            submitOrderAccountId,
            decreaseNumber,
            userStockList,
            userStocks,
        );

        [userStockList, userStocks] = await userStockIncrease(
            prisma,
            stockId,
            findOrderAccountId,
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
    userStockList: { update: number[] },
    userStocks: Map<number, UserStock>,
): Promise<[{ update: number[] }, Map<number, UserStock>]> {
    const increaseNumber = submitOrderNumber;
    const decreaseNumber = submitOrderNumber;

    const stockId = submitOrder.stockId;
    const submitOrderAccountId = submitOrder.accountId;
    const findOrderAccountId = findOrder.accountId;

    // 잔고 수정
    if (tradingType === TradingType.buy) {
        [userStockList, userStocks] = await userStockIncrease(
            prisma,
            stockId,
            submitOrderAccountId,
            increaseNumber,
            userStockList,
            userStocks,
            findOrder.price,
        );

        [userStockList, userStocks] = await userStockDecrease(
            prisma,
            stockId,
            findOrderAccountId,
            decreaseNumber,
            userStockList,
            userStocks,
        );
    } else {
        [userStockList, userStocks] = await userStockDecrease(
            prisma,
            stockId,
            submitOrderAccountId,
            decreaseNumber,
            userStockList,
            userStocks,
        );

        [userStockList, userStocks] = await userStockIncrease(
            prisma,
            stockId,
            findOrderAccountId,
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
    userStockList: { update: number[] },
    userStocks: Map<number, UserStock>,
): Promise<[{ update: number[] }, Map<number, UserStock>]> {
    const order = [findOrder];
    const increaseNumber = findOrderNumber;
    const decreaseNumber = findOrderNumber;

    const stockId = submitOrder.stockId;
    const submitOrderAccountId = submitOrder.accountId;
    const findOrderAccountId = findOrder.accountId;

    // 잔고 수정
    if (tradingType === TradingType.buy) {
        [userStockList, userStocks] = await userStockIncrease(
            prisma,
            stockId,
            submitOrderAccountId,
            increaseNumber,
            userStockList,
            userStocks,
            findOrder.price,
        );

        [userStockList, userStocks] = await userStockDecrease(
            prisma,
            stockId,
            findOrderAccountId,
            decreaseNumber,
            userStockList,
            userStocks,
        );
    } else {
        [userStockList, userStocks] = await userStockDecrease(
            prisma,
            stockId,
            submitOrderAccountId,
            decreaseNumber,
            userStockList,
            userStocks,
        );

        [userStockList, userStocks] = await userStockIncrease(
            prisma,
            stockId,
            findOrderAccountId,
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
