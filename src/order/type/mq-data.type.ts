import { User } from '@prisma/client';
import { BuyOrder } from './buy.type';
import { CancelOrder } from './cancel.type';
import { EditOrder } from './edit.type';
import { SellOrder } from './sell.type';

export const OrderAction = {
    buy: 'buy',
    sell: 'sell',
    cancel: 'cancel',
    edit: 'edit',
} as const;

export type OrderAction = (typeof OrderAction)[keyof typeof OrderAction];

export type MqData =
    | { type: typeof OrderAction.buy; data: BuyOrder; user: User; timestamp: number }
    | { type: typeof OrderAction.sell; data: SellOrder; user: User; timestamp: number }
    | { type: typeof OrderAction.cancel; data: CancelOrder; user: User; timestamp: number }
    | { type: typeof OrderAction.edit; data: EditOrder; user: User; timestamp: number };
