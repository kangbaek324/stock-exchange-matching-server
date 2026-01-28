enum OrderType {
    limit = 'limit',
    market = 'market',
}

export class BuyDto {
    accountNumber: number;
    stockId: number;
    price: number;
    number: number;
    orderType: OrderType;
}
