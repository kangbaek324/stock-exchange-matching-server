import { Injectable } from '@nestjs/common';
import { STOCK_LIMIT } from 'src/common/consants/stock.constants';
import { PrismaService } from 'src/common/prisma/prisma.service';

@Injectable()
export class StockLimitService {
    constructor(private prismaService: PrismaService) {}

    private getTickSize(price: number) {
        if (price < 2000) return 1;
        if (price < 5000) return 5;
        if (price < 20000) return 10;
        if (price < 50000) return 50;
        if (price < 200000) return 100;
        if (price < 500000) return 500;
        return 1000;
    }

    async getStockLimit(stockId: number) {
        // @TODO Redis 적용필요
        const prevHistory = await this.prismaService.stockHistory.findFirst({
            where: {
                stockId: stockId,
            },
            orderBy: {
                date: 'desc',
            },
            select: {
                close: true,
            },
        });

        const prevClose = prevHistory.close;
        const upperRaw = Math.floor(Number(prevClose) * (1 + STOCK_LIMIT.UPPER_RATE));
        const lowerRaw = Math.ceil(Number(prevClose) * (1 - STOCK_LIMIT.LOWER_RATE));

        const upperTick = this.getTickSize(upperRaw);
        const lowerTick = this.getTickSize(lowerRaw);

        const upperLimit = Math.floor(upperRaw / upperTick) * upperTick;
        const lowerLimit = Math.ceil(lowerRaw / lowerTick) * lowerTick;

        return {
            upperLimit,
            lowerLimit,
        };
    }
}
