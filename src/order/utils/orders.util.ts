import { Order, OrderStatus, PrismaClient, UserStock } from '@prisma/client';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

// 가진 주식의 수를 증가
export async function userStockIncrease(
    tx: PrismaClient,
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
            await tx.userStock.create({
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

// 가진 주식의 수를 감소
export async function userStockDecrease(
    tx: PrismaClient,
    stockId: number,
    accountId: number,
    decreaseNumber: bigint,
    userStockList: { update: number[] }, // accountId 저장
    userStocks: Map<number, UserStock>, // accountId, user_stocks 객체
): Promise<[{ update: number[] }, Map<number, UserStock>]> {
    const userStock = userStocks.get(accountId);

    // 더 이상 보유 수량이 없을때
    if (userStock.number - decreaseNumber === 0n) {
        await tx.userStock.delete({
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

// 체결되고 난뒤 잔여 수량 업데이트
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

// 주문 상태 업데이트
// 배열의 크기는 최소1개 최대 2개
// 주문이 한가지일 경우에는 number에 업데이트될 수량을 매게변수로 받음
export async function orderCompleteUpdate(prisma: PrismaClient, orders, number?: bigint) {
    if (orders.length == 2) {
        for (let i = 0; i < orders.length; i++) {
            await prisma.order.update({
                where: {
                    id: orders[i].id,
                },
                data: {
                    status: OrderStatus.y,
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
                status: OrderStatus.y,
                matchNumber: number,
            },
        });
    } else throw new Error('올바르지 않은 배열 크기입니다');
}

// 주식 가격 업데이트
export async function stockPriceUpdate(tx: PrismaClient, stockId: number, updatePrice: bigint) {
    // 주식 가격 업데이트
    await tx.stock.update({
        where: { id: stockId },
        data: {
            price: updatePrice,
        },
    });

    // 당일 날짜 조회 및 당일 가격 정보 조회
    const today = dayjs().utc().format('YYYY-MM-DD');
    const stockHistory = await tx.stockHistory.findUnique({
        where: {
            stockId_date: {
                stockId: stockId,
                date: new Date(today),
            },
        },
    });

    // 당일 가격 정보 업데이트
    if (!stockHistory) {
        await tx.stockHistory.create({
            data: {
                stockId: stockId,
                date: new Date(today),
                low: updatePrice,
                high: updatePrice,
                close: updatePrice,
                open: updatePrice,
            },
        });
    } else {
        // 당일 저가 업데이트
        if (stockHistory.low > updatePrice) {
            await tx.stockHistory.update({
                where: {
                    stockId_date: {
                        stockId: stockId,
                        date: new Date(today),
                    },
                },
                data: {
                    low: updatePrice,
                },
            });
        }

        // 당일 고가 업데이트
        if (stockHistory.high < updatePrice) {
            await tx.stockHistory.update({
                where: {
                    stockId_date: {
                        stockId: stockId,
                        date: new Date(today),
                    },
                },
                data: {
                    high: updatePrice,
                },
            });
        }

        // 당일 종가 업데이트
        await tx.stockHistory.update({
            where: {
                stockId_date: {
                    stockId: stockId,
                    date: new Date(today),
                },
            },
            data: {
                close: updatePrice,
            },
        });
    }
}

export function createOrderMatch(
    submitOrder: Order,
    findOrder: Order,
    isFindOrderBigger?: boolean,
) {
    const stockId = submitOrder.stockId;

    // 3번째 경우의 수: 제출한 주문의 수가 더 클때, 찾은 주문의 수가 모두 체결된것이기에 찾은 주문을 기준으로 number를 맞춰야 함
    if (isFindOrderBigger) {
        return {
            stockId: stockId,
            number: findOrder.number - findOrder.matchNumber,
            initialOrderId: findOrder.id,
            orderId: submitOrder.id,
        };
    } else {
        return {
            stockId: stockId,
            number: submitOrder.number - submitOrder.matchNumber,
            initialOrderId: findOrder.id,
            orderId: submitOrder.id,
        };
    }
}
