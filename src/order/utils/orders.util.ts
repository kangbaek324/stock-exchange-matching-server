import { PrismaClient, UserStock } from '@prisma/client';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

/**
 *
 * @param prisma
 * @param stockId
 * @param accountId
 * @param increaseNumber
 * @param userStockList
 * @param userStocks
 * @param buyPrice
 * @returns userStockList, userStocks를 담은 배열로 반환
 */
export async function userStockIncrease(
    prisma: PrismaClient,
    stockId: number,
    accountId: number,
    increaseNumber: bigint,
    userStockList: { update: number[] }, // accountId 저장
    userStocks: Map<number, UserStock>, // accountId, user_stocks 객체
    buyPrice: bigint,
): Promise<[{ update: number[] }, Map<number, UserStock>]> {
    const userStock = userStocks.get(accountId);

    // 첫 매수
    if (!userStock) {
        userStocks.set(
            accountId,
            await prisma.userStock.create({
                data: {
                    accountId: accountId,
                    stockId: stockId,
                    number: increaseNumber,
                    canNumber: increaseNumber,
                    average: buyPrice,
                    totalBuyAmount: buyPrice * increaseNumber,
                },
            }),
        );
    } else {
        userStocks.set(accountId, {
            ...userStock,
            number: userStock.number + increaseNumber,
            canNumber: userStock.canNumber + increaseNumber,
            average:
                (userStock.average * userStock.number + buyPrice * increaseNumber) /
                (userStock.number + increaseNumber),
            totalBuyAmount: userStock.totalBuyAmount + buyPrice * increaseNumber,
        });

        userStockList.update.push(accountId);
    }

    return [userStockList, userStocks];
}

/**
 *
 * @param prisma
 * @param stockId
 * @param accountId
 * @param decreaseNumber
 * @param userStockList
 * @param userStocks
 * @param isFindOrder
 * @returns userStockList, userStocks를 담은 배열로 반환
 */
export async function userStockDecrease(
    prisma: PrismaClient,
    stockId: number,
    accountId: number,
    decreaseNumber: bigint,
    userStockList: { update: number[] }, // accountId 저장
    userStocks: Map<number, UserStock>, // accountId, user_stocks 객체
): Promise<[{ update: number[] }, Map<number, UserStock>]> {
    const userStock = userStocks.get(accountId);

    // 더 이상 보유 수량이 없을때
    if (userStock.number - decreaseNumber == 0n) {
        await prisma.userStock.delete({
            where: {
                accountId_stockId: {
                    accountId: accountId,
                    stockId: stockId,
                },
            },
        });
    } else {
        userStocks.set(accountId, {
            ...userStock,
            number: userStock.number - decreaseNumber,
            totalBuyAmount: userStock.totalBuyAmount - userStock.average * decreaseNumber,
        });

        userStockList.update.push(accountId);
    }

    return [userStockList, userStocks];
}

/**
 * 체결되고 난뒤 잔여 수량 업데이트
 * @param prisma
 * @param remainderOrder
 * @param completeOrder
 */
export async function orderMatchAndRemainderUpdate(prisma, remainderOrder, completeOrder) {
    await prisma.order.update({
        where: {
            id: remainderOrder.id,
        },
        data: {
            matchNumber:
                remainderOrder.matchNumber + (completeOrder.number - completeOrder.matchNumber),
        },
    });
}

/**
 *  * 주문 상태 업데이트
 *
 * 배열의 크기는 최소1개 최대 2개
 * 주문이 한가지일 경우에는 number에 업데이트될 수량을 매게변수로 받음
 *
 * @param prisma
 * @param orders
 * @param number
 */
export async function orderCompleteUpdate(prisma: PrismaClient, orders, number?: bigint) {
    if (orders.length == 2) {
        for (let i = 0; i < orders.length; i++) {
            await prisma.order.update({
                where: {
                    id: orders[i].id,
                },
                data: {
                    status: 'y',
                    matchNumber: orders[i].number,
                },
            });
        }
    } else if (orders.length == 1) {
        await prisma.order.update({
            where: {
                id: orders[0].id,
            },
            data: {
                status: 'y',
                matchNumber: number,
            },
        });
    } else throw new Error('올바르지 않은 배열 크기입니다');
}

/**
 *
 * 체결된 가격으로 주식가격 업데이트
 * @param prisma
 * @param data
 * @param updatePrice
 */
export async function stockPriceUpdate(prisma: PrismaClient, data, updatePrice) {
    await prisma.stock.update({
        where: { id: data.stockId },
        data: {
            price: updatePrice,
        },
    });

    const today = dayjs().utc().format('YYYY-MM-DD');
    const stockHistory = await prisma.stockHistory.findUnique({
        where: {
            stockId_date: {
                stockId: data.stockId,
                date: new Date(today),
            },
        },
    });

    if (!stockHistory) {
        await prisma.stockHistory.create({
            data: {
                stockId: data.stockId,
                date: new Date(today),
                low: updatePrice,
                high: updatePrice,
                close: updatePrice,
                open: updatePrice,
            },
        });
    } else {
        if (stockHistory.low > updatePrice) {
            await prisma.stockHistory.update({
                where: {
                    stockId_date: {
                        stockId: data.stockId,
                        date: new Date(today),
                    },
                },
                data: {
                    low: updatePrice,
                },
            });
        }
        if (stockHistory.high < updatePrice) {
            await prisma.stockHistory.update({
                where: {
                    stockId_date: {
                        stockId: data.stockId,
                        date: new Date(today),
                    },
                },
                data: {
                    high: updatePrice,
                },
            });
        }

        await prisma.stockHistory.update({
            where: {
                stockId_date: {
                    stockId: data.stockId,
                    date: new Date(today),
                },
            },
            data: {
                close: updatePrice,
            },
        });
    }
}

export function createOrderMatch(data, submitOrder, findOrder, isFindOrderBigger?: boolean) {
    // 3번째 경우의 수: 제출한 주문의 수가 더 클때, 찾은 주문의 수가 모두 체결된것이기에 찾은 주문을 기준으로 number를 맞춰야 함
    if (isFindOrderBigger) {
        return {
            stockId: data.stockId,
            number: findOrder.number - findOrder.matchNumber,
            initialOrderId: findOrder.id,
            orderId: submitOrder.id,
        };
    } else {
        return {
            stockId: data.stockId,
            number: submitOrder.number - submitOrder.matchNumber,
            initialOrderId: findOrder.id,
            orderId: submitOrder.id,
        };
    }
}
