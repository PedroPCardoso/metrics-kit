# NestJS + TypeORM example

Chart-ready metrics from TypeORM entities using `nestjs-metrics`.

## Install

```bash
npm install nestjs-metrics typeorm @nestjs/typeorm
```

## Register the module

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MetricsModule } from 'nestjs-metrics/nestjs';
import { Order } from './order.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order]),
    MetricsModule.forRoot({
      locale: 'en',
      timezone: 'UTC',
    }),
  ],
  providers: [DashboardService],
})
export class OrdersModule {}
```

## Build a dashboard service

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MetricsService } from 'nestjs-metrics/nestjs';
import { Order } from './order.entity';

@Injectable()
export class DashboardService {
  constructor(
    private readonly metrics: MetricsService,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
  ) {}

  async monthlyRevenue() {
    return this.metrics
      .query(this.orders.createQueryBuilder('orders'))
      .sumByMonth('amount', 12)
      .forYear(2026)
      .fillMissingData()
      .trends();
  }

  async ordersByStatus() {
    return this.metrics
      .query(this.orders.createQueryBuilder('orders'))
      .count()
      .labelColumn('status')
      .forYear(2026)
      .trends();
  }
}
```

## Expected output

```ts
monthlyRevenue();
// → { labels: ['January', 'February', ...], data: [1200, 950, ...] }

ordersByStatus();
// → { labels: ['pending', 'paid', 'cancelled'], data: [10, 45, 2] }
```

## Next steps

- See the full NestJS guide at [`docs/GUIA-NESTJS.md`](../../docs/GUIA-NESTJS.md).
- Read the API reference in [`packages/core`](../core).
