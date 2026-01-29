export type BuyOrder = {
    accountNumber: number;
    stockId: number;
    price: number;
    number: number;
    orderType: 'limit' | 'market';
};
