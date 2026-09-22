import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Metrics } from 'nestjs-metrics';
import { toChartJs } from 'nestjs-metrics-core/charts';
import { createDataSource, Order } from './data-source';
import { seed } from './seed';

@Injectable()
export class DashboardService implements OnModuleInit {
  private ds!: DataSource;

  async onModuleInit(): Promise<void> {
    this.ds = await createDataSource();
    await seed(this.ds);
  }

  async revenueByMonth() {
    const qb = this.ds.getRepository(Order).createQueryBuilder('orders');
    const result = await Metrics.query(qb)
      .sumByMonth('orders.amount')
      .forYear(new Date().getFullYear())
      .trends();
    return toChartJs(result, { label: 'Revenue' });
  }

  async ordersByStatus() {
    const qb = this.ds.getRepository(Order).createQueryBuilder('orders');
    const result = await Metrics.query(qb)
      .countByMonth()
      .forYear(new Date().getFullYear())
      .labelColumn('orders.status')
      .trends();
    return toChartJs(result);
  }

  async kpis() {
    const qb = this.ds.getRepository(Order).createQueryBuilder('orders');
    const totalOrders = await Metrics.query(qb).count().metrics();
    const totalRevenue = await Metrics.query(qb).sum('orders.amount').metrics();
    return { totalOrders, totalRevenue };
  }
}
