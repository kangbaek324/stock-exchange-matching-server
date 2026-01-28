enum OrderType {
    limit = 'limit',
    market = 'market',
}

export class SellDto {
    accountNumber: number;
    stockId: number;
    price: number;
    number: number;
    orderType: OrderType;
}
