export type SellOrder = {
    accountNumber: number;
    stockId: number;
    price: bigint;
    number: bigint;
    orderType: 'limit' | 'market';
};
