export type SellOrder = {
    accountNumber: number;
    stockId: number;
    price: number;
    number: number;
    orderType: 'limit' | 'market';
};
