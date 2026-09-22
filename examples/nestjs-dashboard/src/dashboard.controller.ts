import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { DashboardService } from './dashboard.service';
import * as path from 'path';
import * as fs from 'fs';

@Controller()
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  @Get('api/revenue-by-month')
  async revenueByMonth() {
    return this.svc.revenueByMonth();
  }

  @Get('api/orders-by-status')
  async ordersByStatus() {
    return this.svc.ordersByStatus();
  }

  @Get('api/kpis')
  async kpis() {
    return this.svc.kpis();
  }

  @Get()
  index(@Res() res: Response) {
    const html = fs.readFileSync(
      path.join(__dirname, '..', 'public', 'index.html'),
      'utf-8',
    );
    res.type('text/html').send(html);
  }
}
